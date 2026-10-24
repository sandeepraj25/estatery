import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { can, PROPERTY_STATUSES } from '@estatery/shared';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.guard.js';
import { AuditService } from '../audit/audit.service.js';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const page = z.preprocess((v) => (v === undefined || v === '' ? 1 : Number(v)), z.number().int().min(1).max(1000));
const limit = z.preprocess((v) => (v === undefined || v === '' ? 20 : Number(v)), z.number().int().min(1).max(100));
const opt = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === '' ? undefined : v), s.optional());

export const adminPropertyQuery = z.object({
  q: opt(z.string().trim().max(80)),
  status: opt(z.enum(PROPERTY_STATUSES)),
  page,
  limit,
});
export const auditQuery = z.object({ page, limit });

@Injectable()
export class AdminService {
  constructor(
    @InjectModel('Property') private readonly properties: Model<any>,
    @InjectModel('Lead') private readonly leads: Model<any>,
    @InjectModel('Agent') private readonly agents: Model<any>,
    @InjectModel('Membership') private readonly memberships: Model<any>,
    private readonly audit: AuditService,
  ) {}

  /**
   * Lead visibility: managers/admins/support see every lead; agents only see leads assigned to
   * their advisor profile. An agent without a linked profile sees none (fail closed).
   */
  leadScope(tenantId: Types.ObjectId, auth: AuthContext): Record<string, unknown> | null {
    if (can(auth.role, 'leads:read:all')) return { tenantId };
    if (can(auth.role, 'leads:read:own')) return auth.agentId ? { tenantId, agentId: auth.agentId } : null;
    return null;
  }

  async dashboard(tenantId: Types.ObjectId, auth: AuthContext) {
    const since30 = new Date(Date.now() - 30 * 86400_000);
    const today = new Date().toISOString().slice(0, 10);
    const leadScope = this.leadScope(tenantId, auth);

    const [byStatus, featured, team] = await Promise.all([
      this.properties.aggregate<{ _id: string; n: number }>([{ $match: { tenantId } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      this.properties.countDocuments({ tenantId, status: 'published', featured: true }),
      can(auth.role, 'team:read') ? this.memberships.countDocuments({ tenantId, status: 'active' }) : Promise.resolve(null),
    ]);
    const inventory = Object.fromEntries(PROPERTY_STATUSES.map((s) => [s, byStatus.find((b) => b._id === s)?.n ?? 0]));

    let leads = null;
    if (leadScope) {
      const [total30, newCount, won, closed, recent, visits] = await Promise.all([
        this.leads.countDocuments({ ...leadScope, createdAt: { $gte: since30 } }),
        this.leads.countDocuments({ ...leadScope, status: 'new' }),
        this.leads.countDocuments({ ...leadScope, status: 'won' }),
        this.leads.countDocuments({ ...leadScope, status: { $in: ['won', 'lost'] } }),
        this.leads.find(leadScope).sort({ createdAt: -1 }).limit(6).lean<any[]>(),
        this.leads.find({ ...leadScope, intent: 'site-visit', preferredDate: { $gte: today } }).sort({ preferredDate: 1 }).limit(5).lean<any[]>(),
      ]);
      const titles = await this.propertyTitles(tenantId, [...recent, ...visits]);
      leads = {
        last30Days: total30,
        awaitingContact: newCount,
        conversionRate: closed > 0 ? Math.round((won / closed) * 100) : null,
        recent: recent.map((l) => this.leadRow(l, titles)),
        upcomingVisits: visits.map((l) => this.leadRow(l, titles)),
      };
    }

    const activity = can(auth.role, 'audit:read') ? (await this.audit.list(tenantId, 1, 6)).items : null;
    return { inventory, featured, team, leads, activity };
  }

  async listProperties(tenantId: Types.ObjectId, q: z.output<typeof adminPropertyQuery>) {
    const filter: Record<string, unknown> = { tenantId };
    if (q.status) filter.status = q.status;
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      filter.$or = [{ title: rx }, { 'location.locality': rx }, { 'location.city': rx }, { slug: rx }];
    }
    const [docs, total, agents] = await Promise.all([
      this.properties.find(filter, { description: 0, amenities: 0 }).sort({ updatedAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean<any[]>(),
      this.properties.countDocuments(filter),
      this.agents.find({ tenantId }, { name: 1 }).lean<any[]>(),
    ]);
    const agentName = new Map(agents.map((a) => [a._id.toString(), a.name as string]));
    return {
      items: docs.map((p) => ({
        id: p._id.toString(), slug: p.slug, title: p.title, status: p.status, listingType: p.listingType, type: p.type,
        price: p.price, priceUnit: p.priceUnit, city: p.location?.city, locality: p.location?.locality,
        featured: !!p.featured, verified: !!p.verified, image: p.images?.[0]?.url ?? null,
        agent: p.agentId ? (agentName.get(p.agentId.toString()) ?? null) : null,
        updatedAt: new Date(p.updatedAt).toISOString(),
      })),
      page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)),
    };
  }

  private async propertyTitles(tenantId: Types.ObjectId, leads: any[]) {
    const ids = [...new Set(leads.map((l) => l.propertyId?.toString()).filter(Boolean))];
    if (!ids.length) return new Map<string, { title: string; slug: string }>();
    const props = await this.properties.find({ tenantId, _id: { $in: ids.map((i) => new Types.ObjectId(i)) } }, { title: 1, slug: 1 }).lean<any[]>();
    return new Map(props.map((p) => [p._id.toString(), { title: p.title as string, slug: p.slug as string }]));
  }

  private leadRow(l: any, titles: Map<string, { title: string; slug: string }>) {
    return {
      id: l._id.toString(), name: l.name, email: l.email, phone: l.phone, message: l.message, intent: l.intent, status: l.status,
      source: l.source, budget: l.budget, preferredDate: l.preferredDate,
      property: l.propertyId ? (titles.get(l.propertyId.toString()) ?? null) : null,
      createdAt: new Date(l.createdAt).toISOString(),
    };
  }
}
