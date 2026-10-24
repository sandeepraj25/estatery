import { Schema } from 'mongoose';
import { LEAD_INTENTS, LEAD_STATUSES } from '@estatery/shared';
import { tenantScopePlugin } from '../../common/tenancy/tenant-scope.plugin.js';

export const LeadSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, maxlength: 120 },
    phone: { type: String, required: true, maxlength: 20 },
    message: { type: String, default: '', maxlength: 1000 },
    intent: { type: String, enum: LEAD_INTENTS, default: 'enquiry' },
    status: { type: String, enum: LEAD_STATUSES, default: 'new' },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', default: null },
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent', default: null },
    preferredDate: { type: String, default: null },
    budget: { type: String, default: null },
    source: { type: String, default: 'website' },
    consentAt: { type: Date, required: true },
    meta: { ip: { type: String, default: null }, userAgent: { type: String, default: null } },
    assignedAt: { type: Date, default: null },
    /** First move out of "new": used for response-time reporting. */
    firstContactedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    lostReason: { type: String, default: null, maxlength: 1000 },
    lastActivityAt: { type: Date, default: null },
  },
  { timestamps: true },
);
LeadSchema.plugin(tenantScopePlugin);
LeadSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
LeadSchema.index({ tenantId: 1, agentId: 1, createdAt: -1 });

/** Timeline entries: status changes, assignments, notes, logged calls, notifications. */
export const LeadActivitySchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
    type: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, default: 'System' },
    body: { type: String, default: '', maxlength: 4000 },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
LeadActivitySchema.plugin(tenantScopePlugin);
LeadActivitySchema.index({ tenantId: 1, leadId: 1, createdAt: -1 });

/** Follow-up reminders, emailed to the assignee when due. */
export const LeadReminderSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dueAt: { type: Date, required: true },
    note: { type: String, required: true, maxlength: 500 },
    doneAt: { type: Date, default: null },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
LeadReminderSchema.plugin(tenantScopePlugin);
LeadReminderSchema.index({ tenantId: 1, assigneeId: 1, doneAt: 1, dueAt: 1 });
LeadReminderSchema.index({ doneAt: 1, notifiedAt: 1, dueAt: 1 });
LeadReminderSchema.index({ tenantId: 1, leadId: 1 });
