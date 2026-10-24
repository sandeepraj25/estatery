import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_THEME_PRESET, homepageSchema, siteSettingsSchema, THEME_PRESETS, type CreateAgencyInput, type SiteSettings,
} from '@estatery/shared';
import { loadEnv } from '../../config/env.js';
import { randomToken, sha256 } from '../auth/tokens.service.js';
import { MailService } from '../mail/mail.service.js';
import { defaultHomepage, defaultPages } from './site-defaults.js';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, type Model } from 'mongoose';
import type { AuthContext } from '../auth/auth.guard.js';
import { AuditService } from '../audit/audit.service.js';
import { BillingService } from '../billing/billing.service.js';
import { TenantsService } from '../tenants/tenants.service.js';

/**
 * Platform-operator view across every agency. These are the only intentionally cross-tenant
 * queries in the codebase, each marked with `crossTenant: true`.
 */
@Injectable()
export class PlatformService {
  constructor(
    @InjectModel('Tenant') private readonly tenants: Model<any>,
    @InjectModel('Domain') private readonly domains: Model<any>,
    @InjectModel('Property') private readonly properties: Model<any>,
    @InjectModel('Lead') private readonly leads: Model<any>,
    @InjectModel('Membership') private readonly memberships: Model<any>,
    @InjectModel('Theme') private readonly themes: Model<any>,
    @InjectModel('Page') private readonly pages: Model<any>,
    @InjectModel('SiteVersion') private readonly versions: Model<any>,
    @InjectModel('Invite') private readonly invites: Model<any>,
    private readonly mail: MailService,
    private readonly tenantsService: TenantsService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
  ) {}

  async listTenants() {
    const group = (model: Model<any>, match: Record<string, unknown> = {}) =>
      model.aggregate<{ _id: unknown; n: number }>([{ $match: match }, { $group: { _id: '$tenantId', n: { $sum: 1 } } }]).option({ crossTenant: true });
    const [tenants, domains, listings, leads, members] = await Promise.all([
      this.tenants.find({}).sort({ createdAt: 1 }).lean<any[]>(),
      this.domains.find({}).lean<any[]>(),
      group(this.properties, { status: 'published' }),
      group(this.leads, { createdAt: { $gte: new Date(Date.now() - 30 * 86400_000) } }),
      group(this.memberships, { status: 'active' }),
    ]);
    const count = (rows: Array<{ _id: unknown; n: number }>, id: string) => rows.find((r) => String(r._id) === id)?.n ?? 0;
    const billing = await this.billing.platformRows(tenants.map((t) => t._id));
    return {
      items: tenants.map((t) => {
        const id = t._id.toString();
        return {
          id, slug: t.slug, name: t.name, status: t.status, createdAt: new Date(t.createdAt).toISOString(),
          domains: domains.filter((d) => d.tenantId.toString() === id).map((d) => ({ hostname: d.hostname, kind: d.kind, verified: d.verified, isPrimary: d.isPrimary })),
          publishedListings: count(listings, id), leads30d: count(leads, id), activeUsers: count(members, id),
          billing: billing.get(id) ?? null,
        };
      }),
    };
  }

  /**
   * Creates a new agency ready to be set up: platform subdomain, default theme, homepage, pages
   * and business details, a 14-day trial, and an emailed invitation for its owner.
   */
  async createTenant(actor: AuthContext, input: CreateAgencyInput, ip: string | null) {
    const env = loadEnv();
    const hostname = `${input.slug}.${env.PLATFORM_DOMAIN}`.toLowerCase();
    if (await this.tenants.exists({ slug: input.slug })) throw new ConflictException({ code: 'SLUG_TAKEN', message: 'Another agency already uses this address.', fields: [{ path: 'slug', message: 'Already taken' }] });
    if (await this.domains.exists({ hostname })) throw new ConflictException({ code: 'SLUG_TAKEN', message: `${hostname} is already in use.`, fields: [{ path: 'slug', message: 'Already taken' }] });

    const settings: SiteSettings = siteSettingsSchema.parse({
      businessName: input.name, tagline: '', logoText: input.name.split(/\s+/)[0], logoUrl: null,
      contact: { phone: '', whatsapp: '', email: input.ownerEmail, address: '', hours: '' },
      social: [],
      navigation: [
        { label: 'Buy', href: '/properties?listingType=sale' }, { label: 'Rent', href: '/properties?listingType=rent' },
        { label: 'Insights', href: '/insights' }, { label: 'About', href: '/about' }, { label: 'Contact', href: '/contact' },
      ],
      footerColumns: [
        { title: 'Discover', links: [{ label: 'Homes for sale', href: '/properties?listingType=sale' }, { label: 'Homes for rent', href: '/properties?listingType=rent' }] },
        { title: 'Company', links: [{ label: 'About us', href: '/about' }, { label: 'FAQ', href: '/faq' }, { label: 'Contact', href: '/contact' }] },
      ],
      locale: 'en-IN', currency: 'INR', timezone: 'Asia/Kolkata',
      seo: { title: input.name, description: `Homes to buy and rent with ${input.name}.`, ogImage: null },
      showPlatformBranding: true,
    });
    const theme = (THEME_PRESETS[input.themePreset] ?? THEME_PRESETS[DEFAULT_THEME_PRESET]!).tokens;
    const homepage = homepageSchema.parse(defaultHomepage(input.name));
    const pages = defaultPages(settings);

    const tenant = await this.tenants.create({ slug: input.slug, name: input.name, status: 'active', settings });
    const tenantId = tenant._id;
    await this.domains.create({ hostname, tenantId, kind: 'platform', verified: true, status: 'verified', verifiedAt: new Date(), isPrimary: true });
    await this.themes.create({ tenantId, draft: theme, published: theme });
    await this.pages.create({ tenantId, key: 'home', draft: homepage, published: homepage });
    await this.pages.create({ tenantId, key: 'pages', draft: pages, published: pages });
    await this.versions.create({ tenantId, version: 1, snapshot: { settings, theme, homepage, pages }, note: 'New agency', publishedBy: actor.userId, publishedByName: `${actor.name} (platform)`, changed: ['settings', 'theme', 'homepage', 'pages'] });

    const token = randomToken();
    await this.invites.create({ tenantId, email: input.ownerEmail, role: 'owner', tokenHash: sha256(token), invitedBy: actor.userId, expiresAt: new Date(Date.now() + 14 * 86_400_000) });
    const local = /(^|\.)localhost$/.test(hostname);
    const inviteUrl = `${local ? 'http' : 'https'}://${hostname}${local ? `:${env.DEV_WEB_PORT}` : ''}/admin/accept-invite?token=${token}`;
    const emailed = await this.mail.send({
      to: input.ownerEmail,
      subject: `Your ${input.name} website is ready to set up`,
      text: `Hi ${input.ownerName.split(' ')[0]},\n\nYour agency website and Admin Panel are ready. Accept this invitation to create your owner account (valid for 14 days):\n${inviteUrl}\n\nYour site is at ${local ? 'http' : 'https'}://${hostname}${local ? `:${env.DEV_WEB_PORT}` : ''} and your 14-day free trial has started. You can connect your own domain from Admin Panel → Domains.`,
    });
    this.tenantsService.invalidate();
    await this.audit.record({ tenantId, actor: { id: actor.userId, name: `${actor.name} (platform)` }, action: 'platform.tenant_created', targetType: 'tenant', targetId: tenantId.toString(), summary: `Agency created; owner invited (${input.ownerEmail})`, ip });
    return {
      id: tenantId.toString(), slug: input.slug, hostname, emailed,
      // Shown to the operator only outside production, where emails may not be delivered.
      inviteUrl: env.NODE_ENV === 'production' ? null : inviteUrl,
    };
  }

  async setStatus(actor: AuthContext, tenantId: string, status: 'active' | 'suspended', ip: string | null) {
    if (!isValidObjectId(tenantId)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Agency not found.' });
    const t = await this.tenants.findByIdAndUpdate(tenantId, { $set: { status } }, { new: true }).lean<any>();
    if (!t) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Agency not found.' });
    this.tenantsService.invalidate();
    await this.audit.record({
      tenantId: t._id, actor: { id: actor.userId, name: `${actor.name} (platform)` }, action: status === 'suspended' ? 'platform.suspended' : 'platform.activated',
      targetType: 'tenant', targetId: tenantId, summary: status === 'suspended' ? 'Site suspended by the platform operator' : 'Site re-activated by the platform operator', ip,
    });
    return { id: tenantId, status };
  }
}
