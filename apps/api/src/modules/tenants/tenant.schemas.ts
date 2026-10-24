import { Schema, type Types } from 'mongoose';
import { TenantBillingSchema } from '../billing/billing.schemas.js';

/** Central tenant registry. Not tenant-scoped itself: it *is* the scope. */
export const TenantSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9-]{2,40}$/ },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    status: { type: String, enum: ['trial', 'active', 'suspended'], default: 'trial', index: true },
    /** Validated with siteSettingsSchema (shared) before every write. */
    settings: { type: Schema.Types.Mixed, required: true },
    /** Unpublished edits from the Admin Panel. Null means "same as published". */
    settingsDraft: { type: Schema.Types.Mixed, default: null },
    siteVersion: { type: Number, default: 1 },
    settingsDraftRevision: { type: Number, default: 0 },
    /** CRM notification and assignment settings (crmSettingsSchema). */
    crm: { type: Schema.Types.Mixed, default: null },
    crmRoundRobin: { type: Number, default: 0 },
    /** Subscription and plan (null = never subscribed: free trial from createdAt). */
    billing: { type: TenantBillingSchema, default: null },
  },
  { timestamps: true, minimize: false },
);
TenantSchema.index({ 'billing.subscriptionId': 1 }, { sparse: true });
export interface TenantDoc {
  _id: Types.ObjectId;
  slug: string;
  name: string;
  status: 'trial' | 'active' | 'suspended';
  settings: unknown;
}

/**
 * Hostnames that resolve to a tenant. Platform subdomains are verified on creation; custom domains
 * become routable only after DNS TXT verification (implemented with the admin panel phase).
 */
export const DomainSchema = new Schema(
  {
    hostname: { type: String, required: true, unique: true, lowercase: true, trim: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    kind: { type: String, enum: ['platform', 'custom'], required: true },
    /** Only verified domains route traffic. */
    verified: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'verified', 'failed', 'lost'], default: 'pending' },
    verificationToken: { type: String, default: null },
    isPrimary: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
    lastCheckedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    failedChecks: { type: Number, default: 0 },
    /** Unverified claims lapse so a domain can't be held hostage by someone who doesn't own it. */
    claimExpiresAt: { type: Date, default: null },
    routing: { ok: { type: Boolean }, detail: { type: String } },
    tls: {
      status: { type: String, enum: ['unknown', 'pending', 'active', 'error'], default: 'unknown' },
      checkedAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null },
      error: { type: String, default: null },
      /** Certificate provider reference (e.g. Cloudflare custom hostname id). */
      providerRef: { type: String, default: null },
    },
  },
  { timestamps: true },
);
DomainSchema.index({ tenantId: 1, kind: 1 });
DomainSchema.index({ kind: 1, verified: 1, lastCheckedAt: 1 });
export interface DomainDoc {
  _id: Types.ObjectId;
  hostname: string;
  tenantId: Types.ObjectId;
  kind: 'platform' | 'custom';
  verified: boolean;
  status: 'pending' | 'verified' | 'failed' | 'lost';
  verificationToken: string | null;
  isPrimary: boolean;
  verifiedAt: Date | null;
  lastCheckedAt: Date | null;
  lastError: string | null;
  failedChecks: number;
  claimExpiresAt: Date | null;
  routing?: { ok?: boolean; detail?: string } | null;
  tls?: { status: string; checkedAt: Date | null; expiresAt: Date | null; error: string | null; providerRef: string | null };
  createdAt: Date;
}
