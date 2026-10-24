import { Schema } from 'mongoose';
import { BILLING_INTERVALS, PLAN_CODES, SUBSCRIPTION_STATUSES } from '@estatery/shared';
import { tenantScopePlugin } from '../../common/tenancy/tenant-scope.plugin.js';

/**
 * Billing state embedded in each tenant (see BillingState in @estatery/shared for meanings).
 * Null on agencies that have never been through checkout: they are on the free trial.
 */
export const TenantBillingSchema = new Schema(
  {
    plan: { type: String, enum: [...PLAN_CODES, null], default: null },
    interval: { type: String, enum: [...BILLING_INTERVALS, null], default: null },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: 'none' },
    trialEndsAt: { type: Date, default: null },
    paidThrough: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    haltedAt: { type: Date, default: null },
    compPlan: { type: String, enum: [...PLAN_CODES, null], default: null },
    compUntil: { type: Date, default: null },
    scheduledPlan: { type: String, enum: [...PLAN_CODES, null], default: null },
    scheduledInterval: { type: String, enum: [...BILLING_INTERVALS, null], default: null },
    /** Razorpay subscription currently bound to this agency. */
    subscriptionId: { type: String, default: null },
    customerId: { type: String, default: null },
    /** created_at of the newest webhook applied, so late or replayed events never roll state back. */
    lastEventAt: { type: Number, default: 0 },
    /** Checkout started but not yet confirmed by Razorpay. */
    checkout: {
      subscriptionId: { type: String, default: null },
      plan: { type: String, enum: [...PLAN_CODES, null], default: null },
      interval: { type: String, enum: [...BILLING_INTERVALS, null], default: null },
      createdAt: { type: Date, default: null },
    },
    /** One-off notices already emailed (so jobs never repeat them). */
    notices: { trialEnding: { type: Date, default: null } },
  },
  { _id: false },
);

/** Razorpay plan ids, one per (plan, interval, price, mode). Global, not tenant-owned. */
export const BillingPlanSchema = new Schema(
  {
    code: { type: String, enum: PLAN_CODES, required: true },
    interval: { type: String, enum: BILLING_INTERVALS, required: true },
    amount: { type: Number, required: true },
    mode: { type: String, enum: ['live', 'test'], required: true },
    /** Key id the plan was created under (test and live keys have separate plan catalogues). */
    keyId: { type: String, required: true },
    razorpayPlanId: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);
BillingPlanSchema.index({ code: 1, interval: 1, amount: 1, keyId: 1 }, { unique: true });

/**
 * Every webhook received, keyed by Razorpay's event id. The unique index is what makes delivery
 * idempotent: Razorpay retries and replays are recognised and skipped.
 */
export const BillingEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true },
    event: { type: String, required: true },
    status: { type: String, enum: ['processing', 'processed', 'ignored', 'failed'], required: true },
    tenantId: { type: Schema.Types.ObjectId, default: null, index: true },
    subscriptionId: { type: String, default: null },
    createdAtRzp: { type: Number, default: 0 },
    attempts: { type: Number, default: 1 },
    error: { type: String, default: null },
    note: { type: String, default: null },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

/** Payments for an agency's subscription (receipts and failures). */
export const BillingPaymentSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    paymentId: { type: String, required: true, unique: true },
    subscriptionId: { type: String, default: null },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: ['captured', 'failed', 'refunded'], required: true },
    method: { type: String, default: null },
    plan: { type: String, enum: [...PLAN_CODES, null], default: null },
    interval: { type: String, enum: [...BILLING_INTERVALS, null], default: null },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    invoiceId: { type: String, default: null },
    invoiceUrl: { type: String, default: null },
    failureReason: { type: String, default: null },
    paidAt: { type: Date, required: true },
  },
  { timestamps: true },
);
BillingPaymentSchema.index({ tenantId: 1, paidAt: -1 });
BillingPaymentSchema.plugin(tenantScopePlugin);

/** Subscriptions held by the local payment simulator (development and tests only). */
export const BillingSimSubscriptionSchema = new Schema(
  { subId: { type: String, required: true, unique: true }, entity: { type: Schema.Types.Mixed, required: true } },
  { timestamps: true, minimize: false },
);
