import { Schema } from 'mongoose';
import { tenantScopePlugin } from '../../common/tenancy/tenant-scope.plugin.js';

/** Append-only record of sensitive actions. Never stores passwords, tokens or payment data. */
export const AuditLogSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, default: 'System' },
    action: { type: String, required: true },
    targetType: { type: String, default: null },
    targetId: { type: String, default: null },
    summary: { type: String, required: true, maxlength: 300 },
    meta: { type: Schema.Types.Mixed, default: {} },
    ip: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
AuditLogSchema.plugin(tenantScopePlugin);
AuditLogSchema.index({ tenantId: 1, createdAt: -1 });
