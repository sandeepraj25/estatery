import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { stringify } from 'csv-stringify/sync';
import { isValidObjectId, Types, type Model } from 'mongoose';
import {
  can, crmSettingsSchema, LEAD_INTENTS, LEAD_STATUS_LABELS, LEAD_STATUSES, OPEN_LEAD_STATUSES,
  type CrmSettings, type LeadStatus,
} from '@estatery/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.guard.js';
import { QueueService } from '../jobs/queue.service.js';
import { EntitlementsService } from '../billing/entitlements.service.js';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const opt = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === '' ? undefined : v), s.optional());

export const leadListQuery = z.object({
  q: opt(z.string().trim().max(80)),
  status: opt(z.enum(LEAD_STATUSES)),
  intent: opt(z.enum(LEAD_INTENTS)),
  agent: opt(z.union([z.literal('unassigned'), z.string().regex(/^[a-f0-9]{24}$/)])),
  from: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  to: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  page: z.preprocess((v) => (v === undefined || v === '' ? 1 : Number(v)), z.number().int().min(1).max(1000)),
  limit: z.preprocess((v) => (v === undefined || v === '' ? 25 : Number(v)), z.number().int().min(1).max(100)),
});
export type LeadListQuery = z.output<typeof leadListQuery>;

type Actor = Pick<AuthContext, 'userId' | 'name' | 'role' | 'agentId' | 'permissions'>;

/**
 * The CRM. Every read and write goes through `scope()`: managers, admins and support see all
 * of the agency's leads; agents see only leads assigned to their advisor profile; anyone else
 * sees nothing. Writes additionally need leads:write, and reassignment needs leads:assign.
 */
@Injectable()
export class CrmService {
  constructor(
    @InjectModel('Lead') private readonly leads: Model<any>,
    @InjectModel('LeadActivity') private readonly activities: Model<any>,
    @InjectModel('LeadReminder') private readonly reminders: Model<any>,
    @InjectModel('Agent') private readonly agents: Model<any>,
    @InjectModel('Property') private readonly properties: Model<any>,
    @InjectModel('Membership') private readonly memberships: Model<any>,
    @InjectModel('User') private readonly users: Model<any>,
    @InjectModel('Tenant') private readonly tenants: Model<any>,
    private readonly queue: QueueService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
  ) {}

  scope(tenantId: Types.ObjectId, a: Actor): Record<string, unknown> | null {
    if (can(a.role, 'leads:read:all')) return { tenantId };
    if (can(a.role, 'leads:read:own')) return a.agentId ? { tenantId, agentId: a.agentId } : null;
    return null;
  }

  private requireScope(tenantId: Types.ObjectId, a: Actor) {
    const s = this.scope(tenantId, a);
    if (!s) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Your role doesn’t include access to leads.' });
    return s;
  }

  private async findScoped(tenantId: Types.ObjectId, a: Actor, id: string) {
    const scope = this.requireScope(tenantId, a);
    if (!isValidObjectId(id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Lead not found.' });
    const lead = await this.leads.findOne({ ...scope, _id: new Types.ObjectId(id) }).lean<any>();
    // Same response whether the lead doesn't exist or belongs to someone you can't see.
    if (!lead) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Lead not found.' });
    return lead;
  }

  private requireWrite(a: Actor) {
    if (!can(a.role, 'leads:write')) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Your role can view leads but not update them.' });
  }

  // ------------------------------------------------------------------------------- reads

  async list(tenantId: Types.ObjectId, a: Actor, q: LeadListQuery) {
    if (!can(a.role, 'leads:read:all') && !can(a.role, 'leads:read:own')) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Your role doesn’t include access to leads.' });
    }
    // An agent whose login isn't linked to an advisor profile gets an empty list, not an error.
    const scope = this.scope(tenantId, a);
    if (!scope) return { items: [], page: 1, limit: q.limit, total: 0, totalPages: 1, scope: 'none' as const };
    const filter: Record<string, unknown> = { ...scope };
    if (q.status) filter.status = q.status;
    if (q.intent) filter.intent = q.intent;
    if (q.agent && can(a.role, 'leads:read:all')) filter.agentId = q.agent === 'unassigned' ? null : new Types.ObjectId(q.agent);
    if (q.from || q.to) {
      filter.createdAt = {
        ...(q.from ? { $gte: new Date(`${q.from}T00:00:00+05:30`) } : {}),
        ...(q.to ? { $lte: new Date(`${q.to}T23:59:59.999+05:30`) } : {}),
      };
    }
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }
    const [docs, total] = await Promise.all([
      this.leads.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean<any[]>(),
      this.leads.countDocuments(filter),
    ]);
    return {
      items: await this.rows(tenantId, docs),
      page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)),
      scope: can(a.role, 'leads:read:all') ? ('all' as const) : ('own' as const),
    };
  }

  /** Pipeline board: open stages with their newest leads, plus closed counts. */
  async board(tenantId: Types.ObjectId, a: Actor, agent?: string) {
    const scope = this.requireScope(tenantId, a);
    const base: Record<string, unknown> = { ...scope };
    if (agent && can(a.role, 'leads:read:all')) base.agentId = agent === 'unassigned' ? null : isValidObjectId(agent) ? new Types.ObjectId(agent) : undefined;
    const columns = await Promise.all(
      OPEN_LEAD_STATUSES.map(async (status) => {
        const f = { ...base, status };
        const [docs, total] = await Promise.all([this.leads.find(f).sort({ lastActivityAt: -1, createdAt: -1 }).limit(50).lean<any[]>(), this.leads.countDocuments(f)]);
        return { status, label: LEAD_STATUS_LABELS[status], total, items: await this.rows(tenantId, docs) };
      }),
    );
    const since = new Date(Date.now() - 30 * 86400_000);
    const [won, lost] = await Promise.all([
      this.leads.countDocuments({ ...base, status: 'won', closedAt: { $gte: since } }),
      this.leads.countDocuments({ ...base, status: 'lost', closedAt: { $gte: since } }),
    ]);
    return { columns, closed30d: { won, lost } };
  }

  async detail(tenantId: Types.ObjectId, a: Actor, id: string) {
    const lead = await this.findScoped(tenantId, a, id);
    const [row] = await this.rows(tenantId, [lead]);
    const [activity, reminders, agents] = await Promise.all([
      this.activities.find({ tenantId, leadId: lead._id }).sort({ createdAt: -1 }).limit(200).lean<any[]>(),
      this.reminders.find({ tenantId, leadId: lead._id }).sort({ doneAt: 1, dueAt: 1 }).lean<any[]>(),
      can(a.role, 'leads:assign') ? this.agents.find({ tenantId, active: true }, { name: 1, title: 1 }).sort({ order: 1 }).lean<any[]>() : [],
    ]);
    const assigneeNames = await this.userNames(reminders.map((r) => r.assigneeId));
    return {
      lead: { ...row, message: lead.message, budget: lead.budget, preferredDate: lead.preferredDate, lostReason: lead.lostReason, firstContactedAt: iso(lead.firstContactedAt), closedAt: iso(lead.closedAt) },
      activity: activity.map((x) => ({ id: x._id.toString(), type: x.type, actorName: x.actorName, body: x.body, meta: x.meta ?? {}, createdAt: iso(x.createdAt) })),
      reminders: reminders.map((r) => this.reminderDto(r, assigneeNames)),
      assignableAgents: agents.map((x) => ({ id: x._id.toString(), name: x.name as string, title: x.title as string })),
      teammates: await this.assignableUsers(tenantId, a),
    };
  }

  // ------------------------------------------------------------------------------- writes

  async setStatus(tenantId: Types.ObjectId, a: Actor, id: string, status: LeadStatus, note: string) {
    this.requireWrite(a);
    const lead = await this.findScoped(tenantId, a, id);
    if (lead.status === status) return this.detail(tenantId, a, id);
    if (status === 'lost' && note.trim().length < 3) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Say why this lead was lost — it helps you spot patterns.', fields: [{ path: 'note', message: 'Add a short reason' }] });
    }
    const now = new Date();
    const set: Record<string, unknown> = { status, lastActivityAt: now };
    if (lead.status === 'new' && !lead.firstContactedAt) set.firstContactedAt = now;
    set.closedAt = status === 'won' || status === 'lost' ? now : null;
    set.lostReason = status === 'lost' ? note : null;
    await this.leads.updateOne({ tenantId, _id: lead._id }, { $set: set });
    await this.log(tenantId, lead._id, a, 'status', note, { from: lead.status, to: status });
    return this.detail(tenantId, a, id);
  }

  async assign(tenantId: Types.ObjectId, a: Actor, id: string, agentId: string | null) {
    if (!can(a.role, 'leads:assign')) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only managers and administrators can reassign leads.' });
    const lead = await this.findScoped(tenantId, a, id);
    let agent: any = null;
    if (agentId) {
      agent = await this.agents.findOne({ tenantId, _id: new Types.ObjectId(agentId), active: true }, { name: 1 }).lean<any>();
      if (!agent) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Choose an active advisor from your team.' });
    }
    if (String(lead.agentId ?? '') === String(agentId ?? '')) return this.detail(tenantId, a, id);
    await this.leads.updateOne({ tenantId, _id: lead._id }, { $set: { agentId: agent?._id ?? null, assignedAt: agent ? new Date() : null, lastActivityAt: new Date() } });
    await this.log(tenantId, lead._id, a, 'assigned', '', { to: agent?.name ?? null });
    if (agent) await this.queue.enqueue('lead.notify', { tenantId: tenantId.toString(), leadId: lead._id.toString(), reason: 'assigned' });
    return this.detail(tenantId, a, id);
  }

  async addNote(tenantId: Types.ObjectId, a: Actor, id: string, body: string, kind: string) {
    this.requireWrite(a);
    const lead = await this.findScoped(tenantId, a, id);
    const set: Record<string, unknown> = { lastActivityAt: new Date() };
    // Logging a real conversation counts as first contact for response-time reporting.
    if (kind !== 'note' && !lead.firstContactedAt) set.firstContactedAt = new Date();
    await this.leads.updateOne({ tenantId, _id: lead._id }, { $set: set });
    await this.log(tenantId, lead._id, a, kind, body);
    return this.detail(tenantId, a, id);
  }

  async addReminder(tenantId: Types.ObjectId, a: Actor, id: string, input: { dueAt: string; note: string; assigneeUserId: string | null }) {
    this.requireWrite(a);
    const lead = await this.findScoped(tenantId, a, id);
    const due = new Date(input.dueAt);
    if (due.getTime() < Date.now() - 60_000) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Choose a time in the future.', fields: [{ path: 'dueAt', message: 'Choose a time in the future' }] });
    let assignee = a.userId;
    if (input.assigneeUserId && input.assigneeUserId !== a.userId.toString()) {
      if (!can(a.role, 'leads:assign')) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You can only set reminders for yourself.' });
      const m = await this.memberships.findOne({ tenantId, userId: new Types.ObjectId(input.assigneeUserId), status: 'active' }, { _id: 1 }).lean();
      if (!m) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Choose someone on your team.' });
      assignee = new Types.ObjectId(input.assigneeUserId);
    } else if (!input.assigneeUserId && lead.agentId) {
      // Default to the assigned advisor's login, if they have one.
      const m = await this.memberships.findOne({ tenantId, agentId: lead.agentId, status: 'active' }, { userId: 1 }).lean<any>();
      if (m && (can(a.role, 'leads:assign') || m.userId.equals(a.userId))) assignee = m.userId;
    }
    await this.reminders.create({ tenantId, leadId: lead._id, assigneeId: assignee, createdBy: a.userId, dueAt: due, note: input.note });
    const names = await this.userNames([assignee]);
    await this.log(tenantId, lead._id, a, 'reminder', input.note, { dueAt: due.toISOString(), assignee: names.get(assignee.toString()) ?? '' });
    return this.detail(tenantId, a, id);
  }

  async updateReminder(tenantId: Types.ObjectId, a: Actor, reminderId: string, done: boolean) {
    this.requireWrite(a);
    if (!isValidObjectId(reminderId)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Reminder not found.' });
    const r = await this.reminders.findOne({ tenantId, _id: new Types.ObjectId(reminderId) }).lean<any>();
    if (!r) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Reminder not found.' });
    await this.findScoped(tenantId, a, r.leadId.toString()); // must be able to see the lead
    if (!r.assigneeId.equals(a.userId) && !can(a.role, 'leads:assign')) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the person it’s assigned to can complete this reminder.' });
    await this.reminders.updateOne({ tenantId, _id: r._id }, { $set: { doneAt: done ? new Date() : null } });
    if (done) await this.log(tenantId, r.leadId, a, 'reminder_done', r.note);
    return this.detail(tenantId, a, r.leadId.toString());
  }

  async myReminders(tenantId: Types.ObjectId, a: Actor) {
    if (!this.scope(tenantId, a)) return { items: [] };
    const docs = await this.reminders.find({ tenantId, assigneeId: a.userId, doneAt: null }).sort({ dueAt: 1 }).limit(20).lean<any[]>();
    const leads = await this.leads.find({ tenantId, _id: { $in: docs.map((d) => d.leadId) } }, { name: 1, status: 1 }).lean<any[]>();
    const byId = new Map(leads.map((l) => [l._id.toString(), l]));
    return {
      items: docs.filter((d) => byId.has(d.leadId.toString())).map((d) => ({
        id: d._id.toString(), leadId: d.leadId.toString(), leadName: byId.get(d.leadId.toString())!.name as string, note: d.note as string,
        dueAt: iso(d.dueAt)!, overdue: new Date(d.dueAt).getTime() < Date.now(),
      })),
    };
  }

  /** Right to erasure: removes the enquiry and everything attached to it. */
  async erase(tenantId: Types.ObjectId, a: AuthContext, id: string, ip: string | null) {
    if (!can(a.role, 'leads:delete')) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only owners and administrators can permanently delete leads.' });
    const lead = await this.findScoped(tenantId, a, id);
    await Promise.all([
      this.activities.deleteMany({ tenantId, leadId: lead._id }),
      this.reminders.deleteMany({ tenantId, leadId: lead._id }),
      this.leads.deleteOne({ tenantId, _id: lead._id }),
    ]);
    const initials = String(lead.name).split(/\s+/).map((w: string) => `${w[0] ?? ''}.`).join(' ');
    // The audit entry deliberately keeps no personal data.
    await this.audit.record({ tenantId, actor: { id: a.userId, name: a.name }, action: 'lead.erased', targetType: 'lead', targetId: id, summary: `Permanently deleted an enquiry (${initials}) and its history on request`, ip });
  }

  async exportCsv(tenantId: Types.ObjectId, a: AuthContext, q: LeadListQuery, ip: string | null) {
    if (!can(a.role, 'leads:export')) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Your role can’t export leads.' });
    await this.entitlements.assertFeature(tenantId, 'leadExport');
    const all = await this.list(tenantId, a, { ...q, page: 1, limit: 100 });
    const pages = Math.min(all.totalPages, 100);
    const rows = [...all.items];
    for (let p = 2; p <= pages; p++) rows.push(...(await this.list(tenantId, a, { ...q, page: p, limit: 100 })).items);
    await this.audit.record({ tenantId, actor: { id: a.userId, name: a.name }, action: 'lead.exported', summary: `Exported ${rows.length} leads to CSV`, ip });
    const safe = (v: unknown) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v ?? '');
    return stringify(
      rows.map((r) => ({
        received: r.createdAt, name: r.name, email: r.email, phone: r.phone, stage: LEAD_STATUS_LABELS[r.status as LeadStatus], intent: r.intent,
        property: r.property?.title ?? '', advisor: r.agent ?? '', source: r.source, budget: r.budget ?? '', visitDate: r.preferredDate ?? '', message: r.message ?? '',
      })).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, safe(v)]))),
      { header: true },
    );
  }

  async getSettings(tenantId: Types.ObjectId): Promise<CrmSettings> {
    const t = await this.tenants.findById(tenantId, { crm: 1 }).lean<any>();
    return crmSettingsSchema.parse(t?.crm ?? {});
  }

  async saveSettings(tenantId: Types.ObjectId, a: AuthContext, settings: CrmSettings, ip: string | null) {
    if (settings.roundRobin && !(await this.getSettings(tenantId)).roundRobin) await this.entitlements.assertFeature(tenantId, 'roundRobin');
    await this.tenants.updateOne({ _id: tenantId }, { $set: { crm: settings } });
    await this.audit.record({ tenantId, actor: { id: a.userId, name: a.name }, action: 'crm.settings', summary: `Updated lead notifications (${settings.notifyEmails.length} extra inbox${settings.notifyEmails.length === 1 ? '' : 'es'}, round-robin ${settings.roundRobin ? 'on' : 'off'})`, ip });
    return settings;
  }

  // ------------------------------------------------------------------- public-lead hooks

  /** Called right after a visitor's enquiry is saved. */
  async onNewLead(tenantId: Types.ObjectId, leadId: Types.ObjectId) {
    const lead = await this.leads.findOne({ tenantId, _id: leadId }).lean<any>();
    if (!lead) return;
    const settings = await this.getSettings(tenantId);
    let assignedName: string | null = null;
    // Round-robin pauses (without changing the saved setting) while the plan doesn't include it.
    if (!lead.agentId && settings.roundRobin && (await this.entitlements.has(tenantId, 'roundRobin'))) {
      const pool = await this.agents.find({ tenantId, active: true }, { name: 1 }).sort({ order: 1, _id: 1 }).lean<any[]>();
      if (pool.length) {
        // Atomic counter so concurrent enquiries don't land on the same advisor.
        const t = await this.tenants.findOneAndUpdate({ _id: tenantId }, { $inc: { crmRoundRobin: 1 } }, { returnDocument: 'after' }).lean<any>();
        const agent = pool[((t?.crmRoundRobin ?? 1) - 1) % pool.length];
        await this.leads.updateOne({ tenantId, _id: leadId }, { $set: { agentId: agent._id, assignedAt: new Date() } });
        assignedName = agent.name;
      }
    }
    await this.activities.create({ tenantId, leadId, type: 'created', actorName: lead.name, body: lead.message ?? '', meta: { source: lead.source, intent: lead.intent, ...(assignedName ? { autoAssigned: assignedName } : {}) } });
    await this.leads.updateOne({ tenantId, _id: leadId }, { $set: { lastActivityAt: new Date() } });
    await this.queue.enqueue('lead.notify', { tenantId: tenantId.toString(), leadId: leadId.toString(), reason: 'new' });
  }

  // ------------------------------------------------------------------------------ helpers

  private async rows(tenantId: Types.ObjectId, docs: any[]) {
    const propIds = [...new Set(docs.map((l) => l.propertyId?.toString()).filter(Boolean))].map((i) => new Types.ObjectId(i as string));
    const agentIds = [...new Set(docs.map((l) => l.agentId?.toString()).filter(Boolean))].map((i) => new Types.ObjectId(i as string));
    const [props, agents, due] = await Promise.all([
      propIds.length ? this.properties.find({ tenantId, _id: { $in: propIds } }, { title: 1, slug: 1 }).lean<any[]>() : [],
      agentIds.length ? this.agents.find({ tenantId, _id: { $in: agentIds } }, { name: 1 }).lean<any[]>() : [],
      docs.length ? this.reminders.find({ tenantId, leadId: { $in: docs.map((d) => d._id) }, doneAt: null }, { leadId: 1, dueAt: 1 }).lean<any[]>() : [],
    ]);
    const p = new Map(props.map((x) => [x._id.toString(), { title: x.title as string, slug: x.slug as string }]));
    const ag = new Map(agents.map((x) => [x._id.toString(), x.name as string]));
    const next = new Map<string, Date>();
    for (const r of due) {
      const k = r.leadId.toString();
      if (!next.has(k) || r.dueAt < next.get(k)!) next.set(k, r.dueAt);
    }
    return docs.map((l) => ({
      id: l._id.toString(), name: l.name as string, email: l.email as string, phone: l.phone as string, message: l.message as string,
      intent: l.intent as string, status: l.status as LeadStatus, source: l.source as string, budget: l.budget as string | null,
      preferredDate: l.preferredDate as string | null,
      property: l.propertyId ? (p.get(l.propertyId.toString()) ?? null) : null,
      agentId: l.agentId?.toString() ?? null, agent: l.agentId ? (ag.get(l.agentId.toString()) ?? null) : null,
      nextReminderAt: iso(next.get(l._id.toString())), lastActivityAt: iso(l.lastActivityAt), createdAt: iso(l.createdAt)!,
    }));
  }

  private async assignableUsers(tenantId: Types.ObjectId, a: Actor) {
    if (!can(a.role, 'leads:assign')) return [{ id: a.userId.toString(), name: `${a.name} (you)` }];
    const ms = await this.memberships.find({ tenantId, status: 'active', role: { $in: ['owner', 'admin', 'manager', 'agent'] } }, { userId: 1 }).lean<any[]>();
    const names = await this.userNames(ms.map((m) => m.userId));
    return ms.map((m) => ({ id: m.userId.toString(), name: m.userId.equals(a.userId) ? `${names.get(m.userId.toString())} (you)` : (names.get(m.userId.toString()) ?? 'Team member') }));
  }

  private async userNames(ids: Types.ObjectId[]) {
    const users = ids.length ? await this.users.find({ _id: { $in: ids } }, { name: 1 }).lean<any[]>() : [];
    return new Map(users.map((u) => [u._id.toString(), u.name as string]));
  }

  private reminderDto(r: any, names: Map<string, string>) {
    return {
      id: r._id.toString(), note: r.note as string, dueAt: iso(r.dueAt)!, doneAt: iso(r.doneAt), assigneeId: r.assigneeId.toString(),
      assignee: names.get(r.assigneeId.toString()) ?? 'Team member', overdue: !r.doneAt && new Date(r.dueAt).getTime() < Date.now(),
    };
  }

  private log(tenantId: Types.ObjectId, leadId: Types.ObjectId, a: Actor, type: string, body: string, meta: Record<string, unknown> = {}) {
    return this.activities.create({ tenantId, leadId, type, actorId: a.userId, actorName: a.name, body, meta });
  }
}

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
