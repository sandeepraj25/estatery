import { Schema, type Types } from 'mongoose';
import { TENANT_ROLES } from '@estatery/shared';
import { tenantScopePlugin } from '../../common/tenancy/tenant-scope.plugin.js';

/**
 * Identity is global (one person, one login email) and access is per agency through
 * memberships. The same person can work for two agencies with different roles.
 */
export const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    passwordHash: { type: String, required: true },
    /** Platform operator. Set only by platform tooling, never through tenant endpoints. */
    platformOwner: { type: Boolean, default: false },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);
export interface UserDoc {
  _id: Types.ObjectId;
  email: string;
  name: string;
  passwordHash: string;
  platformOwner: boolean;
  failedLogins: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
}

export const MembershipSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: TENANT_ROLES, required: true },
    status: { type: String, enum: ['active', 'deactivated'], default: 'active' },
    /** Links an agent login to their public advisor profile (for lead visibility). */
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent', default: null },
  },
  { timestamps: true },
);
MembershipSchema.plugin(tenantScopePlugin);
MembershipSchema.index({ tenantId: 1, userId: 1 }, { unique: true });
export interface MembershipDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  role: (typeof TENANT_ROLES)[number];
  status: 'active' | 'deactivated';
  agentId: Types.ObjectId | null;
  createdAt: Date;
}

/**
 * One row per issued refresh token. Rotation revokes the old row and links it to its replacement;
 * presenting a revoked token later means it was stolen and replayed, so the whole family is revoked.
 */
export const SessionSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    familyId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
    replacedBy: { type: Schema.Types.ObjectId, default: null },
    userAgent: { type: String, default: null },
    ip: { type: String, default: null },
  },
  { timestamps: true },
);
SessionSchema.plugin(tenantScopePlugin);
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 86400 }); // purge a week after expiry

export const InviteSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    email: { type: String, required: true, lowercase: true },
    role: { type: String, enum: TENANT_ROLES, required: true },
    tokenHash: { type: String, required: true, unique: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
InviteSchema.plugin(tenantScopePlugin);
InviteSchema.index({ tenantId: 1, email: 1 });

/** Password-reset tokens: single use, 30 minutes. Stored hashed. */
export const PasswordResetSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
PasswordResetSchema.plugin(tenantScopePlugin);
PasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });
