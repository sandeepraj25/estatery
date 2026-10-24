import { Schema } from 'mongoose';
import { tenantScopePlugin } from '../../common/tenancy/tenant-scope.plugin.js';

/** Old addresses (e.g. from an agency's previous website) sent to pages on this site. */
export const RedirectSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    permanent: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);
RedirectSchema.index({ tenantId: 1, from: 1 }, { unique: true });
RedirectSchema.plugin(tenantScopePlugin);
