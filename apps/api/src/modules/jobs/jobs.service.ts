import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { LEAD_STATUS_LABELS, crmSettingsSchema, type LeadStatus } from '@estatery/shared';
import { loadEnv } from '../../config/env.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import { QueueService } from './queue.service.js';

const INTENT: Record<string, string> = { enquiry: 'Question about a listing', callback: 'Call-back request', 'site-visit': 'Site visit request', general: 'Home search' };

/**
 * Job handlers. Each job loads fresh data by id (jobs carry ids, never personal data), so a
 * retried or delayed job never sends stale or deleted information.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Jobs');
  private readonly env = loadEnv();

  constructor(
    private readonly queue: QueueService,
    private readonly mail: MailService,
    @InjectModel('Lead') private readonly leads: Model<any>,
    @InjectModel('LeadActivity') private readonly activities: Model<any>,
    @InjectModel('LeadReminder') private readonly reminders: Model<any>,
    @InjectModel('Agent') private readonly agents: Model<any>,
    @InjectModel('Property') private readonly properties: Model<any>,
    @InjectModel('Membership') private readonly memberships: Model<any>,
    @InjectModel('User') private readonly users: Model<any>,
    @InjectModel('Tenant') private readonly tenants: Model<any>,
    @InjectModel('Domain') private readonly domains: Model<any>,
  ) {}

  async onApplicationBootstrap() {
    this.queue.register('email.send', (m: MailMessage) => this.mail.deliver(m));
    this.queue.register('lead.notify', (d: { tenantId: string; leadId: string; reason: 'new' | 'assigned' }) => this.notifyLead(d));
    this.queue.register('reminders.scan', () => this.scanReminders().then(() => undefined));
    this.queue.repeat('reminders.scan', 60_000);
    await this.queue.startWorkers();
  }

  /** Admin Panel link on the agency's own main address. */
  private async adminUrl(tenantId: Types.ObjectId, path: string) {
    const d = (await this.domains.findOne({ tenantId, isPrimary: true }, { hostname: 1 }).lean<any>()) ?? (await this.domains.findOne({ tenantId, verified: true }, { hostname: 1 }).lean<any>());
    const host: string = d?.hostname ?? 'localhost';
    const local = /(^|\.)localhost$|^127\./.test(host);
    return `${local ? 'http' : 'https'}://${host}${local ? `:${this.env.DEV_WEB_PORT}` : ''}${path}`;
  }

  /** Email for the assigned advisor's login, falling back to the public advisor profile email. */
  private async agentEmail(tenantId: Types.ObjectId, agentId: Types.ObjectId | null) {
    if (!agentId) return null;
    const m = await this.memberships.findOne({ tenantId, agentId, status: 'active' }, { userId: 1 }).lean<any>();
    if (m) return ((await this.users.findById(m.userId, { email: 1 }).lean<any>())?.email as string) ?? null;
    return ((await this.agents.findOne({ tenantId, _id: agentId }, { email: 1 }).lean<any>())?.email as string) || null;
  }

  async notifyLead({ tenantId: tid, leadId, reason }: { tenantId: string; leadId: string; reason: 'new' | 'assigned' }) {
    const tenantId = new Types.ObjectId(tid);
    const lead = await this.leads.findOne({ tenantId, _id: new Types.ObjectId(leadId) }).lean<any>();
    if (!lead) return; // erased before the job ran
    const tenant = await this.tenants.findById(tenantId, { name: 1, crm: 1 }).lean<any>();
    const settings = crmSettingsSchema.parse(tenant?.crm ?? {});
    const agentEmail = settings.notifyAssignedAgent || reason === 'assigned' ? await this.agentEmail(tenantId, lead.agentId) : null;
    const recipients = [...new Set([...(reason === 'new' ? settings.notifyEmails : []), ...(agentEmail ? [agentEmail] : [])])];
    if (!recipients.length) return;

    const property = lead.propertyId ? await this.properties.findOne({ tenantId, _id: lead.propertyId }, { title: 1 }).lean<any>() : null;
    const link = await this.adminUrl(tenantId, `/admin/leads/${leadId}`);
    const subject = reason === 'new'
      ? `New enquiry: ${lead.name}${property ? ` — ${property.title}` : ''}`
      : `Lead assigned to you: ${lead.name}`;
    const text = [
      reason === 'new' ? `A new enquiry just arrived on ${tenant?.name ?? 'your website'}.` : `${lead.name}’s enquiry is now assigned to you.`,
      '',
      `Name: ${lead.name}`,
      `Phone: ${lead.phone}`,
      `Email: ${lead.email}`,
      `Request: ${INTENT[lead.intent] ?? lead.intent}${lead.preferredDate ? ` (preferred date ${lead.preferredDate})` : ''}`,
      property ? `Listing: ${property.title}` : lead.budget ? `Budget: ${lead.budget}` : null,
      lead.message ? `Message: “${lead.message}”` : null,
      '',
      `Open the lead: ${link}`,
      '',
      'Tip: enquiries answered within an hour are far more likely to convert.',
    ].filter((l) => l !== null).join('\n');

    for (const to of recipients) await this.queue.enqueue('email.send', { to, subject, text });
    await this.activities.create({ tenantId, leadId: lead._id, type: 'notified', body: '', meta: { reason, recipients: recipients.length } });
  }

  /** Emails reminders that have come due. Each is leased atomically, so it's sent once. */
  async scanReminders(limit = 100) {
    let sent = 0;
    for (let i = 0; i < limit; i++) {
      const r = await this.reminders
        .findOneAndUpdate({ doneAt: null, notifiedAt: null, dueAt: { $lte: new Date() } }, { $set: { notifiedAt: new Date() } }, { new: true })
        .setOptions({ crossTenant: true })
        .lean<any>();
      if (!r) break;
      const [user, lead] = await Promise.all([
        this.users.findById(r.assigneeId, { email: 1, name: 1 }).lean<any>(),
        this.leads.findOne({ tenantId: r.tenantId, _id: r.leadId }, { name: 1, phone: 1, status: 1 }).lean<any>(),
      ]);
      const active = await this.memberships.exists({ tenantId: r.tenantId, userId: r.assigneeId, status: 'active' });
      if (!user || !lead || !active) continue;
      const link = await this.adminUrl(r.tenantId, `/admin/leads/${r.leadId}`);
      await this.queue.enqueue('email.send', {
        to: user.email,
        subject: `Reminder: ${r.note.slice(0, 60)} — ${lead.name}`,
        text: `Hi ${user.name},\n\nYour follow-up for ${lead.name} (${LEAD_STATUS_LABELS[lead.status as LeadStatus]}) is due:\n\n“${r.note}”\n\nPhone: ${lead.phone}\nOpen the lead: ${link}`,
      });
      sent++;
    }
    if (sent) this.logger.log(`Sent ${sent} reminder emails`);
    return sent;
  }
}
