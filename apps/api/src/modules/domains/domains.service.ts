import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'node:crypto';
import { isValidObjectId, type Model, type Types } from 'mongoose';
import type { DomainDto } from '@estatery/shared';
import { loadEnv } from '../../config/env.js';
import type { ResolvedTenant } from '../../common/tenancy/tenant.context.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.guard.js';
import { MailService } from '../mail/mail.service.js';
import { TenantsService } from '../tenants/tenants.service.js';
import type { DomainDoc } from '../tenants/tenant.schemas.js';
import { createCertificateProvider } from './certificates.js';
import { DnsService } from './dns.service.js';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { RedirectsService } from '../redirects/redirects.service.js';

export const TXT_PREFIX = '_estatery-verify';
const strip = (h: string) => h.toLowerCase().replace(/\.$/, '');

interface CheckResult {
  ownership: boolean;
  routing: { ok: boolean; detail: string };
  error: string | null;
}

/**
 * Custom domains.
 *
 * Ownership is proven with a TXT record containing a random per-domain token; traffic only
 * routes once ownership is proven AND the domain's DNS actually points at the platform. Domains
 * are globally unique, unverified claims lapse, platform hostnames can't be claimed, and verified
 * domains are re-checked periodically so a lapsed or transferred domain stops routing.
 */
@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name);
  private readonly env = loadEnv();
  private readonly certs = createCertificateProvider();

  constructor(
    @InjectModel('Domain') private readonly domains: Model<DomainDoc>,
    @InjectModel('Tenant') private readonly tenants: Model<any>,
    @InjectModel('Membership') private readonly memberships: Model<any>,
    @InjectModel('User') private readonly users: Model<any>,
    private readonly dns: DnsService,
    private readonly tenantsService: TenantsService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly entitlements: EntitlementsService,
    private readonly redirects: RedirectsService,
  ) {}

  async list(tenantId: Types.ObjectId): Promise<DomainDto[]> {
    const docs = await this.domains.find({ tenantId }).sort({ kind: -1, createdAt: 1 }).lean<DomainDoc[]>();
    return docs.map((d) => this.toDto(d));
  }

  async add(tenant: ResolvedTenant, actor: AuthContext, hostname: string, ip: string | null) {
    const host = strip(hostname);
    const platform = strip(this.env.PLATFORM_DOMAIN);
    if (host === platform || host.endsWith(`.${platform}`) || host === strip(this.env.DOMAIN_CNAME_TARGET)) {
      throw new BadRequestException({ code: 'RESERVED_DOMAIN', message: 'That address belongs to the platform. Add a domain your agency owns.', fields: [{ path: 'hostname', message: 'This address belongs to the platform' }] });
    }
    const count = await this.domains.countDocuments({ tenantId: tenant.id, kind: 'custom' });
    if (count >= this.env.DOMAIN_MAX_PER_TENANT) {
      throw new BadRequestException({ code: 'DOMAIN_LIMIT', message: `You can connect up to ${this.env.DOMAIN_MAX_PER_TENANT} custom domains. Remove one first.` });
    }
    await this.entitlements.assertCanAdd(tenant.id, 'customDomains');

    const existing = await this.domains.findOne({ hostname: host }).lean<DomainDoc>();
    if (existing) {
      if (existing.tenantId.equals(tenant.id)) throw new ConflictException({ code: 'DOMAIN_EXISTS', message: 'You’ve already added this domain.' });
      const lapsed = !existing.verified && existing.claimExpiresAt && existing.claimExpiresAt.getTime() < Date.now();
      if (!lapsed) {
        // Deliberately vague: don't reveal which agency holds it.
        throw new ConflictException({ code: 'DOMAIN_TAKEN', message: 'This domain is connected to another site on this platform. If you own it, contact support and we’ll help you prove ownership.' });
      }
      await this.domains.deleteOne({ _id: existing._id });
      await this.audit.record({ tenantId: existing.tenantId, action: 'domain.claim_expired', targetType: 'domain', targetId: existing._id.toString(), summary: `Unverified claim on ${host} lapsed and was released` });
    }

    const doc = await this.domains.create({
      hostname: host, tenantId: tenant.id, kind: 'custom', verified: false, status: 'pending', isPrimary: false,
      verificationToken: randomBytes(16).toString('hex'),
      claimExpiresAt: new Date(Date.now() + this.env.DOMAIN_CLAIM_HOURS * 3600_000),
    });
    await this.audit.record({ tenantId: tenant.id, actor: { id: actor.userId, name: actor.name }, action: 'domain.added', targetType: 'domain', targetId: doc._id.toString(), summary: `Added ${host} (awaiting DNS verification)`, ip });
    return this.toDto(doc.toObject() as DomainDoc);
  }

  async verify(tenant: ResolvedTenant, actor: AuthContext, id: string, ip: string | null) {
    const d = await this.find(tenant.id, id);
    if (d.kind !== 'custom') throw new BadRequestException({ code: 'NOT_CUSTOM', message: 'Platform addresses are always connected.' });

    const check = await this.check(d);
    const now = new Date();
    if (check.ownership && check.routing.ok) {
      let providerRef = d.tls?.providerRef ?? null;
      let tlsError: string | null = null;
      try {
        ({ providerRef } = await this.certs.onVerified(d.hostname));
      } catch (e) {
        tlsError = (e as Error).message;
      }
      const tls = await this.dns.tls(d.hostname);
      await this.domains.updateOne({ _id: d._id, tenantId: tenant.id }, {
        $set: {
          verified: true, status: 'verified', verifiedAt: d.verifiedAt ?? now, lastCheckedAt: now, lastError: null, failedChecks: 0, claimExpiresAt: null,
          routing: check.routing,
          tls: { status: tls.ok ? 'active' : 'pending', checkedAt: now, expiresAt: tls.expiresAt, error: tlsError ?? (tls.ok ? null : tls.error), providerRef },
        },
      });
      this.tenantsService.invalidate(d.hostname);
      if (!d.verified) {
        await this.audit.record({ tenantId: tenant.id, actor: { id: actor.userId, name: actor.name }, action: 'domain.verified', targetType: 'domain', targetId: id, summary: `Verified ${d.hostname}; it now serves your website`, ip });
      }
    } else {
      await this.domains.updateOne({ _id: d._id, tenantId: tenant.id }, {
        $set: { status: d.verified ? d.status : check.ownership ? 'pending' : 'failed', lastCheckedAt: now, lastError: check.error, routing: check.routing },
      });
    }
    return this.toDto((await this.domains.findById(d._id).lean<DomainDoc>())!);
  }

  async setPrimary(tenant: ResolvedTenant, actor: AuthContext, id: string, ip: string | null) {
    const d = await this.find(tenant.id, id);
    if (!d.verified) throw new BadRequestException({ code: 'NOT_VERIFIED', message: 'Verify this domain before making it your main address.' });
    if (d.kind === 'custom' && d.tls?.status !== 'active') {
      throw new BadRequestException({ code: 'TLS_PENDING', message: 'HTTPS isn’t active on this domain yet. Check again in a few minutes before making it your main address.' });
    }
    await this.domains.updateMany({ tenantId: tenant.id, isPrimary: true }, { $set: { isPrimary: false } });
    await this.domains.updateOne({ tenantId: tenant.id, _id: d._id }, { $set: { isPrimary: true } });
    this.tenantsService.invalidate();
    await this.audit.record({ tenantId: tenant.id, actor: { id: actor.userId, name: actor.name }, action: 'domain.primary', targetType: 'domain', targetId: id, summary: `Made ${d.hostname} the main website address`, ip });
    return this.list(tenant.id);
  }

  async remove(tenant: ResolvedTenant, actor: AuthContext, id: string, ip: string | null, currentHost: string) {
    const d = await this.find(tenant.id, id);
    if (d.kind === 'platform') throw new BadRequestException({ code: 'PLATFORM_DOMAIN', message: 'Your platform address can’t be removed. It keeps working as a backup.' });
    if (d.hostname === strip(currentHost)) {
      throw new BadRequestException({ code: 'IN_USE', message: 'You’re signed in through this domain. Open the Admin Panel on another address to remove it.' });
    }
    if (d.isPrimary) await this.promotePlatform(tenant.id);
    await this.certs.onRemoved(d.hostname, d.tls?.providerRef ?? null).catch((e) => this.logger.error((e as Error).message));
    await this.domains.deleteOne({ tenantId: tenant.id, _id: d._id });
    this.tenantsService.invalidate(d.hostname);
    await this.audit.record({ tenantId: tenant.id, actor: { id: actor.userId, name: actor.name }, action: 'domain.removed', targetType: 'domain', targetId: id, summary: `Removed ${d.hostname}`, ip });
  }

  /** Scheduled re-check of one verified custom domain. */
  async recheck(d: DomainDoc) {
    const check = await this.check(d);
    const now = new Date();
    if (check.ownership && check.routing.ok) {
      const tls = await this.dns.tls(d.hostname);
      await this.domains.updateOne({ _id: d._id }, {
        $set: {
          lastCheckedAt: now, failedChecks: 0, lastError: null, routing: check.routing,
          'tls.status': tls.ok ? 'active' : 'error', 'tls.checkedAt': now, 'tls.expiresAt': tls.expiresAt, 'tls.error': tls.ok ? null : tls.error,
        },
      });
      return 'ok' as const;
    }
    const failed = (d.failedChecks ?? 0) + 1;
    if (failed < this.env.DOMAIN_LOST_AFTER_FAILURES) {
      await this.domains.updateOne({ _id: d._id }, { $set: { lastCheckedAt: now, failedChecks: failed, lastError: check.error, routing: check.routing } });
      return 'failing' as const;
    }
    // Lost: stop routing, fall back to the platform address, tell the owners.
    await this.domains.updateOne({ _id: d._id }, { $set: { verified: false, status: 'lost', isPrimary: false, lastCheckedAt: now, failedChecks: failed, lastError: check.error, routing: check.routing } });
    if (d.isPrimary) await this.promotePlatform(d.tenantId);
    this.tenantsService.invalidate(d.hostname);
    await this.audit.record({ tenantId: d.tenantId, action: 'domain.lost', targetType: 'domain', targetId: d._id.toString(), summary: `${d.hostname} stopped serving your website: ${check.error ?? 'DNS no longer points here'}` });
    await this.notifyOwners(d.tenantId, d.hostname, check.error);
    return 'lost' as const;
  }

  /** Caddy on-demand TLS: only issue certificates for verified domains of active agencies. */
  async allowCertificate(hostname: string) {
    const d = await this.domains.findOne({ hostname: strip(hostname), verified: true }).lean<DomainDoc>();
    if (!d) return false;
    const t = await this.tenants.findById(d.tenantId, { status: 1 }).lean<any>();
    return !!t && t.status !== 'suspended';
  }

  /** Where the public site should live: a verified custom primary with working HTTPS, else null. */
  async routingFor(tenantId: Types.ObjectId, requestHost: string) {
    const [primary, redirects] = await Promise.all([this.domains.findOne({ tenantId, isPrimary: true }).lean<DomainDoc>(), this.redirects.rules(tenantId)]);
    const host = strip(requestHost);
    if (!primary) return { primaryHost: null, redirectTo: null, redirects };
    const canonical = primary.kind === 'custom' && primary.verified && primary.tls?.status === 'active';
    return { primaryHost: canonical ? primary.hostname : null, redirectTo: canonical && host !== primary.hostname ? primary.hostname : null, redirects };
  }

  // ---------------------------------------------------------------------------------------------

  private async check(d: DomainDoc): Promise<CheckResult> {
    const host = d.hostname;
    const expected = `estatery-verify=${d.verificationToken}`;
    try {
      const [txt, cname, a] = await Promise.all([this.dns.dns.txt(`${TXT_PREFIX}.${host}`), this.dns.dns.cname(host), this.dns.dns.a(host)]);
      const ownership = txt.map((t) => t.trim()).includes(expected);
      const target = strip(this.env.DOMAIN_CNAME_TARGET);
      const allowedA = this.env.DOMAIN_A_RECORDS.split(',').map((s) => s.trim()).filter(Boolean);
      let routing: CheckResult['routing'];
      if (cname.map(strip).includes(target)) routing = { ok: true, detail: `CNAME points to ${target}` };
      else if (allowedA.length && a.length && a.every((ip) => allowedA.includes(ip))) routing = { ok: true, detail: `A records point to ${a.join(', ')}` };
      else if (cname.length) routing = { ok: false, detail: `CNAME points to ${cname.map(strip).join(', ')}, not ${target}` };
      else if (a.length) routing = { ok: false, detail: `A records point to ${a.join(', ')}${allowedA.length ? `, not ${allowedA.join(', ')}` : ''}` };
      else routing = { ok: false, detail: 'No CNAME or A record found yet' };

      const problems = [
        !ownership && (txt.length ? 'The verification TXT record has a different value' : 'The verification TXT record wasn’t found yet'),
        !routing.ok && routing.detail,
      ].filter(Boolean) as string[];
      return { ownership, routing, error: problems.length ? `${problems.join('. ')}.` : null };
    } catch (e) {
      return { ownership: false, routing: { ok: false, detail: 'DNS lookup failed' }, error: `DNS lookup failed (${(e as { code?: string }).code ?? (e as Error).message}). Try again in a minute.` };
    }
  }

  private async promotePlatform(tenantId: Types.ObjectId) {
    await this.domains.updateMany({ tenantId, isPrimary: true }, { $set: { isPrimary: false } });
    await this.domains.updateOne({ tenantId, kind: 'platform', verified: true }, { $set: { isPrimary: true } });
  }

  private async notifyOwners(tenantId: Types.ObjectId, hostname: string, reason: string | null) {
    const owners = await this.memberships.find({ tenantId, role: { $in: ['owner', 'admin'] }, status: 'active' }, { userId: 1 }).lean<any[]>();
    const users = await this.users.find({ _id: { $in: owners.map((o) => o.userId) } }, { email: 1, name: 1 }).lean<any[]>();
    for (const u of users) {
      await this.mail.send({
        to: u.email,
        subject: `${hostname} is no longer connected to your website`,
        text: `Hi ${u.name},\n\nWe checked ${hostname} several times and its DNS no longer points to your website${reason ? ` (${reason})` : ''}.\nYour site is still online at your platform address. Fix the DNS records shown on the Domains page in your Admin Panel and click “Check now” to reconnect it.`,
      });
    }
  }

  private async find(tenantId: Types.ObjectId, id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Domain not found.' });
    const d = await this.domains.findOne({ tenantId, _id: id }).lean<DomainDoc>();
    if (!d) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Domain not found.' });
    return d;
  }

  toDto(d: DomainDoc): DomainDto {
    const iso = (v: Date | null | undefined) => (v ? new Date(v).toISOString() : null);
    const apex = d.hostname.split('.').length === 2;
    const aRecords = this.env.DOMAIN_A_RECORDS.split(',').map((s) => s.trim()).filter(Boolean);
    const records: DomainDto['records'] =
      d.kind === 'custom'
        ? [
            { type: 'TXT', name: `${TXT_PREFIX}.${d.hostname}`, value: `estatery-verify=${d.verificationToken}`, purpose: 'Proves you own the domain. Keep it in place.' },
            ...(apex && aRecords.length
              ? aRecords.map((ip) => ({ type: 'A' as const, name: d.hostname, value: ip, purpose: 'Points your domain at the platform.' }))
              : [{ type: 'CNAME' as const, name: d.hostname, value: this.env.DOMAIN_CNAME_TARGET, purpose: apex ? 'Points your domain at the platform. For a root domain, use your DNS provider’s ALIAS/ANAME or CNAME-flattening option.' : 'Points your domain at the platform.' }]),
          ]
        : [];
    return {
      id: d._id.toString(), hostname: d.hostname, kind: d.kind, isPrimary: d.isPrimary, status: d.kind === 'platform' ? 'verified' : d.status, verified: d.verified,
      verifiedAt: iso(d.verifiedAt), lastCheckedAt: iso(d.lastCheckedAt), lastError: d.lastError ?? null, claimExpiresAt: d.verified ? null : iso(d.claimExpiresAt),
      routing: d.routing?.detail ? { ok: !!d.routing.ok, detail: d.routing.detail } : null,
      tls: { status: (d.kind === 'platform' ? 'active' : (d.tls?.status ?? 'unknown')) as DomainDto['tls']['status'], checkedAt: iso(d.tls?.checkedAt), expiresAt: iso(d.tls?.expiresAt), error: d.tls?.error ?? null },
      records,
    };
  }
}
