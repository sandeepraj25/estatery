import { z } from 'zod';

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'site-visit', 'negotiation', 'won', 'lost'] as const;
export const LEAD_INTENTS = ['enquiry', 'callback', 'site-visit', 'general'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Indian mobile or international number: digits, spaces, +, -, (), 7–20 chars. */
const phone = z.string().trim().regex(/^[+()\d\s-]{7,20}$/, 'Enter a valid phone number');

/** Public enquiry form. The tenant comes from the hostname on the server, never from this body. */
export const createLeadSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(80),
  email: z.string().trim().email('Enter a valid email').max(120),
  phone,
  message: z.string().trim().max(1000).default(''),
  intent: z.enum(LEAD_INTENTS).default('enquiry'),
  propertyId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  budget: z.string().max(40).optional(),
  consent: z.literal(true, { message: 'Please agree to be contacted' }),
  /** Honeypot: real users never fill this hidden field. */
  website: z.string().max(0).optional(),
  source: z.string().max(40).default('website'),
});
export type CreateLeadInput = z.input<typeof createLeadSchema>;

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New', contacted: 'Contacted', qualified: 'Qualified', 'site-visit': 'Site visit', negotiation: 'Negotiation', won: 'Won', lost: 'Lost',
};
/** Stages shown as open pipeline columns; won/lost are closed outcomes. */
export const OPEN_LEAD_STATUSES = ['new', 'contacted', 'qualified', 'site-visit', 'negotiation'] as const;

export const leadStatusChangeSchema = z.object({
  status: z.enum(LEAD_STATUSES),
  /** Required context when closing a lead as lost (helps reporting). */
  note: z.string().trim().max(1000).default(''),
});
export const leadAssignSchema = z.object({ agentId: z.string().regex(/^[a-f0-9]{24}$/).nullable() });
export const leadNoteSchema = z.object({
  body: z.string().trim().min(1, 'Write a note').max(4000),
  kind: z.enum(['note', 'call', 'email', 'whatsapp', 'meeting']).default('note'),
});
export const reminderCreateSchema = z.object({
  dueAt: z.string().datetime({ offset: true, message: 'Choose a date and time' }),
  note: z.string().trim().min(1, 'Say what to follow up on').max(500),
  /** Defaults to the lead's assigned advisor login, or the creator. */
  assigneeUserId: z.string().regex(/^[a-f0-9]{24}$/).nullable().default(null),
});
export const reminderUpdateSchema = z.object({ done: z.boolean() });
export const crmSettingsSchema = z.object({
  /** Extra inboxes that get every new enquiry (e.g. sales@agency.in). */
  notifyEmails: z.array(z.string().trim().toLowerCase().email('Enter a valid email')).max(10).default([]),
  notifyAssignedAgent: z.boolean().default(true),
  /** Spread enquiries without a listing advisor across active advisors. */
  roundRobin: z.boolean().default(false),
});
export type CrmSettings = z.infer<typeof crmSettingsSchema>;

export type LeadActivityType = 'created' | 'status' | 'assigned' | 'note' | 'call' | 'email' | 'whatsapp' | 'meeting' | 'reminder' | 'reminder_done' | 'notified';
