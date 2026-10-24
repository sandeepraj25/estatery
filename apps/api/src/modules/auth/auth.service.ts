import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { hash, verify } from '@node-rs/argon2';
import type { Model, Types } from 'mongoose';
import { ROLE_LABELS, ROLE_PERMISSIONS, type SessionUser, type TenantRole } from '@estatery/shared';
import { loadEnv } from '../../config/env.js';
import type { ResolvedTenant } from '../../common/tenancy/tenant.context.js';
import { AuditService } from '../audit/audit.service.js';
import { MailService } from '../mail/mail.service.js';
import type { AuthContext } from './auth.guard.js';
import { randomToken, sha256, TokensService } from './tokens.service.js';

/** OWASP-recommended argon2id parameters (19 MiB, 2 passes). */
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
/** Verified against when the email is unknown, so response time doesn't reveal which emails exist. */
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hash('not-a-real-password-0000', ARGON));

export const hashPassword = (p: string) => hash(p, ARGON);

interface ReqMeta {
  ip: string | null;
  userAgent: string | null;
  host: string;
}

const INVALID = 'Email or password is incorrect.';

@Injectable()
export class AuthService {
  private readonly env = loadEnv();

  constructor(
    @InjectModel('User') private readonly users: Model<any>,
    @InjectModel('Membership') private readonly memberships: Model<any>,
    @InjectModel('Invite') private readonly invites: Model<any>,
    @InjectModel('PasswordReset') private readonly resets: Model<any>,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  private async issue(tenant: ResolvedTenant, userId: Types.ObjectId, membershipId: Types.ObjectId, meta: ReqMeta) {
    const session = await this.tokens.createSession({ tenantId: tenant.id, userId, userAgent: meta.userAgent, ip: meta.ip });
    const access = await this.tokens.signAccess({
      sub: userId.toString(), tid: tenant.id.toString(), mid: membershipId.toString(), sid: session.sessionId.toString(),
    });
    return { access, refresh: session.refresh, accessTtlSec: this.tokens.accessTtl, refreshExpires: session.expiresAt };
  }

  async login(tenant: ResolvedTenant, email: string, password: string, meta: ReqMeta) {
    const user = await this.users.findOne({ email }).lean<any>();
    if (!user) {
      await verify(await getDummyHash(), password).catch(() => false);
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: INVALID });
    }
    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      const mins = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60_000);
      throw new HttpException(
        { code: 'ACCOUNT_LOCKED', message: `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}, or reset your password.` },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const ok = await verify(user.passwordHash, password).catch(() => false);
    if (!ok) {
      const failed = (user.failedLogins ?? 0) + 1;
      const lock = failed >= this.env.LOGIN_MAX_ATTEMPTS;
      await this.users.updateOne(
        { _id: user._id },
        { $set: { failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + this.env.LOGIN_LOCK_MINUTES * 60_000) : null } },
      );
      const membership = await this.memberships.findOne({ tenantId: tenant.id, userId: user._id }, { _id: 1 }).lean();
      if (membership) {
        await this.audit.record({
          tenantId: tenant.id, actor: { id: user._id, name: user.name }, action: lock ? 'auth.locked' : 'auth.login_failed',
          summary: lock ? `Account locked after ${this.env.LOGIN_MAX_ATTEMPTS} failed sign-in attempts` : 'Failed sign-in attempt', ip: meta.ip,
        });
      }
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: INVALID });
    }

    // Valid password, but the person must also belong to *this* agency.
    const membership = await this.memberships.findOne({ tenantId: tenant.id, userId: user._id }).lean<any>();
    if (!membership || membership.status !== 'active') {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: INVALID });
    }

    await this.users.updateOne({ _id: user._id }, { $set: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await this.audit.record({ tenantId: tenant.id, actor: { id: user._id, name: user.name }, action: 'auth.login', summary: 'Signed in', ip: meta.ip });
    return this.issue(tenant, user._id, membership._id, meta);
  }

  async refresh(tenant: ResolvedTenant, raw: string | undefined, meta: ReqMeta) {
    if (!raw) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Please sign in.' });
    const r = await this.tokens.rotate(tenant.id, raw, meta);
    if (!r.ok) {
      if (r.reason === 'race') throw new ConflictException({ code: 'REFRESH_RACE', message: 'Session is already being refreshed.' });
      if (r.reason === 'reused') {
        await this.audit.record({
          tenantId: tenant.id, action: 'auth.token_reuse', summary: 'A previously used sign-in token was replayed; all related sessions were signed out', ip: meta.ip,
        });
      }
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Your session has ended. Please sign in again.' });
    }
    const membership = await this.memberships.findOne({ tenantId: tenant.id, userId: r.userId, status: 'active' }, { _id: 1 }).lean<any>();
    if (!membership) {
      await this.tokens.revokeAllForUser(tenant.id, r.userId, 'membership-inactive');
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Your access to this site has been removed.' });
    }
    const access = await this.tokens.signAccess({
      sub: r.userId.toString(), tid: tenant.id.toString(), mid: membership._id.toString(), sid: r.sessionId.toString(),
    });
    return { access, refresh: r.refresh, accessTtlSec: this.tokens.accessTtl, refreshExpires: r.expiresAt };
  }

  async logout(tenant: ResolvedTenant, raw: string | undefined) {
    const id = raw?.split('.')[0];
    if (id && /^[a-f0-9]{24}$/.test(id)) await this.tokens.revokeSession(tenant.id, id);
  }

  async logoutAll(tenant: ResolvedTenant, auth: AuthContext, ip: string | null) {
    await this.tokens.revokeAllForUser(tenant.id, auth.userId, 'logout-all');
    await this.audit.record({ tenantId: tenant.id, actor: { id: auth.userId, name: auth.name }, action: 'auth.logout_all', summary: 'Signed out on all devices', ip });
  }

  me(tenant: ResolvedTenant, auth: AuthContext): SessionUser {
    return {
      id: auth.userId.toString(),
      name: auth.name,
      email: auth.email,
      role: auth.role,
      permissions: [...ROLE_PERMISSIONS[auth.role]],
      platformOwner: auth.platformOwner,
      membershipId: auth.membershipId.toString(),
      agentId: auth.agentId?.toString() ?? null,
      tenant: { id: tenant.id.toString(), slug: tenant.slug, name: tenant.name },
    };
  }

  /** Always resolves the same way whether or not the email exists (no account enumeration). */
  async forgotPassword(tenant: ResolvedTenant, email: string, meta: ReqMeta) {
    const user = await this.users.findOne({ email }, { _id: 1, name: 1, email: 1 }).lean<any>();
    if (!user) return;
    const membership = await this.memberships.findOne({ tenantId: tenant.id, userId: user._id, status: 'active' }, { _id: 1 }).lean();
    if (!membership) return;

    const token = randomToken();
    await this.resets.create({ tenantId: tenant.id, userId: user._id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60_000) });
    const link = `${this.origin(meta.host)}/admin/reset-password?token=${token}`;
    await this.mail.send({
      to: user.email,
      subject: `Reset your ${tenant.name} password`,
      text: `Hi ${user.name},\n\nUse this link to choose a new password. It works once and expires in 30 minutes:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email — your password won't change.`,
    });
    await this.audit.record({ tenantId: tenant.id, actor: { id: user._id, name: user.name }, action: 'auth.reset_requested', summary: 'Requested a password reset', ip: meta.ip });
  }

  async resetPassword(tenant: ResolvedTenant, token: string, password: string, meta: ReqMeta) {
    const reset = await this.resets.findOne({ tenantId: tenant.id, tokenHash: sha256(token) }).lean<any>();
    if (!reset || reset.usedAt || new Date(reset.expiresAt).getTime() < Date.now()) {
      throw new BadRequestException({ code: 'TOKEN_INVALID', message: 'This reset link has expired or was already used. Request a new one.' });
    }
    const claimed = await this.resets.updateOne({ tenantId: tenant.id, _id: reset._id, usedAt: null }, { $set: { usedAt: new Date() } });
    if (claimed.modifiedCount === 0) throw new BadRequestException({ code: 'TOKEN_INVALID', message: 'This reset link was already used.' });

    await this.users.updateOne(
      { _id: reset.userId },
      { $set: { passwordHash: await hashPassword(password), passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null } },
    );
    await this.tokens.revokeAllForUserEverywhere(reset.userId, 'password-reset');
    const user = await this.users.findById(reset.userId, { name: 1 }).lean<any>();
    await this.audit.record({ tenantId: tenant.id, actor: { id: reset.userId, name: user?.name ?? 'User' }, action: 'auth.password_reset', summary: 'Reset their password; all sessions were signed out', ip: meta.ip });
  }

  async changePassword(tenant: ResolvedTenant, auth: AuthContext, current: string, next: string, meta: ReqMeta) {
    const user = await this.users.findById(auth.userId).lean<any>();
    if (!user || !(await verify(user.passwordHash, current).catch(() => false))) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Current password is incorrect.', fields: [{ path: 'currentPassword', message: 'Current password is incorrect' }] });
    }
    await this.users.updateOne({ _id: auth.userId }, { $set: { passwordHash: await hashPassword(next), passwordChangedAt: new Date() } });
    await this.tokens.revokeAllForUserEverywhere(auth.userId, 'password-changed');
    await this.audit.record({ tenantId: tenant.id, actor: { id: auth.userId, name: auth.name }, action: 'auth.password_changed', summary: 'Changed their password', ip: meta.ip });
    // Keep the current device signed in with a fresh session.
    return this.issue(tenant, auth.userId, auth.membershipId, meta);
  }

  async previewInvite(tenant: ResolvedTenant, token: string) {
    const inv = await this.findUsableInvite(tenant, token);
    const existing = await this.users.exists({ email: inv.email });
    return { email: inv.email, role: inv.role as TenantRole, roleLabel: ROLE_LABELS[inv.role as TenantRole], agency: tenant.name, hasAccount: !!existing };
  }

  async acceptInvite(tenant: ResolvedTenant, token: string, name: string, password: string, meta: ReqMeta) {
    const inv = await this.findUsableInvite(tenant, token);
    let user = await this.users.findOne({ email: inv.email }).lean<any>();
    if (user) {
      // Existing identity from another agency: prove it's them with their current password.
      if (!(await verify(user.passwordHash, password).catch(() => false))) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'That isn’t the password for this email.', fields: [{ path: 'password', message: 'Use your existing password for this email' }] });
      }
    } else {
      user = (await this.users.create({ email: inv.email, name, passwordHash: await hashPassword(password) })).toObject();
    }

    const claimed = await this.invites.updateOne({ tenantId: tenant.id, _id: inv._id, acceptedAt: null, revokedAt: null }, { $set: { acceptedAt: new Date() } });
    if (claimed.modifiedCount === 0) throw new BadRequestException({ code: 'TOKEN_INVALID', message: 'This invitation was already used.' });

    const existingMembership = await this.memberships.findOne({ tenantId: tenant.id, userId: user._id }).lean<any>();
    const membership = existingMembership
      ? await this.memberships.findOneAndUpdate({ tenantId: tenant.id, _id: existingMembership._id }, { $set: { role: inv.role, status: 'active' } }, { new: true }).lean<any>()
      : (await this.memberships.create({ tenantId: tenant.id, userId: user._id, role: inv.role })).toObject();

    await this.audit.record({
      tenantId: tenant.id, actor: { id: user._id, name: user.name }, action: 'team.invite_accepted',
      targetType: 'membership', targetId: membership._id.toString(), summary: `Joined as ${ROLE_LABELS[inv.role as TenantRole]}`, ip: meta.ip,
    });
    return this.issue(tenant, user._id, membership._id, meta);
  }

  private async findUsableInvite(tenant: ResolvedTenant, token: string) {
    const inv = await this.invites.findOne({ tenantId: tenant.id, tokenHash: sha256(token) }).lean<any>();
    if (!inv || inv.acceptedAt || inv.revokedAt || new Date(inv.expiresAt).getTime() < Date.now()) {
      throw new NotFoundException({ code: 'TOKEN_INVALID', message: 'This invitation has expired or was already used. Ask your administrator for a new one.' });
    }
    return inv;
  }

  origin(host: string) {
    const secure = this.env.COOKIE_SECURE ? this.env.COOKIE_SECURE === 'true' : this.env.NODE_ENV === 'production';
    return `${secure ? 'https' : 'http'}://${host}`;
  }
}
