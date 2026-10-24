import { Schema } from 'mongoose';
import { tenantScopePlugin } from '../../common/tenancy/tenant-scope.plugin.js';

/** One row per stored image. Files live under a per-tenant prefix: tenants/<tenantId>/... */
export const MediaSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    key: { type: String, required: true, unique: true },
    url: { type: String, required: true },
    mime: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    bytes: { type: Number, required: true },
    alt: { type: String, default: '', maxlength: 200 },
    originalName: { type: String, default: '', maxlength: 200 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
MediaSchema.plugin(tenantScopePlugin);
MediaSchema.index({ tenantId: 1, createdAt: -1 });
