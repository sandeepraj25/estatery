import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Types, type Model } from 'mongoose';
import { assignableRoles, ROLE_LABELS, type TenantRole } from '@estatery/shared';
import type { ResolvedTenant } from '../../common/tenancy/tenant.context.js';
import { AuditService } from '../audit/audit.service.js';
import { EntitlementsService } from '../billing/entitlements.service.js';
import type { AuthContext } from '../auth/auth.guard.js';
import { AuthService } from '../auth/auth.service.js';
import { randomToken, sha256, TokensService } from '../auth/tokens.service.js';
import { MailService } from '../mail/mail.service.js';

const INVITE_DAYS = 7;

@Injectable()
export class TeamService {
  constructor(
    @InjectModel('Membership') private readonly memberships: Model<any>,
    @InjectModel('User') private readonly users: Model<any>,
    @InjectModel('Invite') private readonly invites: Model<any>,
    @InjectModel('Agent') private readonly agents: Model<any>,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly auth: AuthService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async list(tenantId: Types.ObjectId) {
    const [members, invites, agents] = await Promise.all([
      this.memberships.find({ tenantId }).sort({ createdAt: 1 }).lean<any[]>(),
      this.invites.find({ tenantId, acceptedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).lean<any[]>(),
      this.agents.find({ tenantId }, { name: 1, title: 1 }).sort({ order: 1 }).lean<any[]>(),
    ]);
    const users = await this.users.find({ _id: { $in: members.map((m) => m.userId) } }, { name: 1, email: 1, lastLoginAt: 1 }).lean<any[]>();
    const byId = new Map(users.map((u) => [u._id.toString(), u]));
    const agentName = new Map(agents.map((a) => [a._id.toString(), a.name as string]));
    return {
      members: members.map((m) => {
        const u = byId.get(m.userId.toString());
        return {
          id: m._id.toString(), userId: m.userId.toString(), name: u?.name ?? 'Unknown', email: u?.email ?? '', role: m.role as TenantRole,
          status: m.status, agentId: m.agentId?.toString() ?? null, agentName: m.agentId ? (agentName.get(m.agentId.toString()) ?? null) : null,
          lastLoginAt: u?.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null, joinedAt: new Date(m.createdAt).toISOString(),
        };
      }),
      invites: invites.map((i) => ({ id: i._id.toString(), email: i.email, role: i.role as TenantRole, expiresAt: new Date(i.expiresAt).toISOString() })),
      agents: agents.map((a) => ({ id: a._id.toString(), name: a.name as string, title: a.title as string })),
    };
  }

  async invite(tenant: ResolvedTenant, actor: AuthContext, email: string, role: TenantRole, host: string, ip: string | null) {
    if (!assignableRoles(actor.role).includes(role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: `Your role can’t invite someone as ${ROLE_LABELS[role]}.` });
    }
    const existingUser = await this.users.findOne({ email }, { _id: 1 }).lean<any>();
    if (existingUser) {
      const m = await this.memberships.findOne({ tenantId: tenant.id, userId: existingUser._id, status: 'active' }, { _id: 1 }).lean();
      if (m) throw new ConflictException({ code: 'ALREADY_MEMBER', message: 'This person is already on your team.' });
    }
    // Re-inviting the same address replaces its invitation, so it doesn't take another seat.
    const reinvite = await this.invites.exists({ tenantId: tenant.id, email, acceptedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } });
    if (!reinvite) await this.entitlements.assertCanAdd(tenant.id, 'seats');
    // One live invitation per email: re-inviting replaces the old link.
    await this.invites.updateMany({ tenantId: tenant.id, email, acceptedAt: null, revokedAt: null }, { $set: { revokedAt: new Date() } });

    const token = randomToken();
    const invite = await this.invites.create({
      tenantId: tenant.id, email, role, tokenHash: sha256(token), invitedBy: actor.userId,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86400_000),
    });
    const inviteUrl = `${this.auth.origin(host)}/admin/accept-invite?token=${token}`;
    const emailed = await this.mail.send({
      to: email,
      subject: `${actor.name} invited you to ${tenant.name}`,
      text: `${actor.name} has invited you to join ${tenant.name} as ${ROLE_LABELS[role]}.\n\nAccept the invitation (valid for ${INVITE_DAYS} days):\n${inviteUrl}`,
    });
    await this.audit.record({
      tenantId: tenant.id, actor: { id: actor.userId, name: actor.name }, action: 'team.invited', targetType: 'invite',
      targetId: invite._id.toString(), summary: `Invited ${email} as ${ROLE_LABELS[role]}`, ip,
    });
    // The link is returned to the inviter so they can share it directly when email isn't set up.
    return { id: invite._id.toString(), inviteUrl, emailed };
  }

  async revokeInvite(tenant: ResolvedTenant, actor: AuthContext, inviteId: string, ip: string | null) {
    if (!isValidObjectId(inviteId)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Invitation not found.' });
    const inv = await this.invites.findOneAndUpdate({ tenantId: tenant.id, _id: inviteId, acceptedAt: null, revokedAt: null }, { $set: { revokedAt: new Date() } }).lean<any>();
    if (!inv) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Invitation not found or already used.' });
    await this.audit.record({ tenantId: tenant.id, actor: { id: actor.userId, name: actor.name }, action: 'team.invite_revoked', targetType: 'invite', targetId: inviteId, summary: `Cancelled the invitation for ${inv.email}`, ip });
  }

  async updateMember(
    tenant: ResolvedTenant,
    actor: AuthContext,
    membershipId: string,
    change: { role?: TenantRole; status?: 'active' | 'deactivated'; agentId?: string | null },
    ip: string | null,
  ) {
    if (!isValidObjectId(membershipId)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Team member not found.' });
    const target = await this.memberships.findOne({ tenantId: tenant.id, _id: membershipId }).lean<any>();
    if (!target) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Team member not found.' });
    if (target._id.equals(actor.membershipId) && (change.role || change.status)) {
      throw new BadRequestException({ code: 'SELF_CHANGE', message: 'You can’t change your own role or access. Ask another administrator.' });
    }
    if (target.role === 'owner' && actor.role !== 'owner') {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only an owner can change another owner.' });
    }
    if (change.role && !assignableRoles(actor.role).includes(change.role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: `Your role can’t assign ${ROLE_LABELS[change.role]}.` });
    }
    const losingOwner = target.role === 'owner' && ((change.role && change.role !== 'owner') || change.status === 'deactivated');
    if (losingOwner) {
      const owners = await this.memberships.countDocuments({ tenantId: tenant.id, role: 'owner', status: 'active' });
      if (owners <= 1) throw new BadRequestException({ code: 'LAST_OWNER', message: 'Every site needs at least one active owner.' });
    }

    if (change.status === 'active' && target.status !== 'active') await this.entitlements.assertCanAdd(tenant.id, 'seats');

    const set: Record<string, unknown> = {};
    if (change.role) set.role = change.role;
    if (change.status) set.status = change.status;
    if (change.agentId !== undefined) {
      if (change.agentId === null) set.agentId = null;
      else {
        const agent = isValidObjectId(change.agentId) && (await this.agents.exists({ tenantId: tenant.id, _id: change.agentId }));
        if (!agent) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Choose an advisor profile from your own team.' });
        set.agentId = new Types.ObjectId(change.agentId);
      }
    }
    await this.memberships.updateOne({ tenantId: tenant.id, _id: target._id }, { $set: set });
    if (change.status === 'deactivated') await this.tokens.revokeAllForUser(tenant.id, target.userId, 'deactivated');

    const user = await this.users.findById(target.userId, { name: 1 }).lean<any>();
    const parts = [
      change.role && change.role !== target.role ? `role ${ROLE_LABELS[target.role as TenantRole]} → ${ROLE_LABELS[change.role]}` : null,
      change.status && change.status !== target.status ? (change.status === 'deactivated' ? 'deactivated access' : 'restored access') : null,
      change.agentId !== undefined ? 'updated advisor profile link' : null,
    ].filter(Boolean);
    await this.audit.record({
      tenantId: tenant.id, actor: { id: actor.userId, name: actor.name }, action: 'team.member_updated', targetType: 'membership',
      targetId: membershipId, summary: `${user?.name ?? 'Member'}: ${parts.join(', ') || 'no changes'}`, meta: { from: { role: target.role, status: target.status }, to: set }, ip,
    });
  }
}
