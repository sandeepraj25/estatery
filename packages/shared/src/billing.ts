import { z } from 'zod';

/**
 * Subscription plans, limits and access rules.
 *
 * The API enforces these; the Admin Panel reads the same definitions to show prices, usage and
 * what each plan includes. Prices are in paise and include 18% GST.
 */

export const PLAN_CODES = ['essential', 'professional', 'signature'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const BILLING_INTERVALS = ['monthly', 'yearly'] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export interface Entitlements {
  /** Live (published) listings. null = unlimited. Drafts are never limited. */
  listings: number | null;
  /** Team members plus pending invitations. */
  seats: number;
  /** Connected custom domains (the free platform subdomain is always included). */
  customDomains: number;
  /** Export leads to CSV. */
  leadExport: boolean;
  /** Share unassigned enquiries between advisors in turn. */
  roundRobin: boolean;
  /** Hide the "Powered by Estatery" line in the website footer. */
  removeBranding: boolean;
}

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  tagline: string;
  /** Paise, GST included. */
  price: Record<BillingInterval, number>;
  entitlements: Entitlements;
}

export const PLANS: Record<PlanCode, PlanDefinition> = {
  essential: {
    code: 'essential',
    name: 'Essential',
    tagline: 'For an independent broker getting a professional site online.',
    price: { monthly: 2_499_00, yearly: 24_990_00 },
    entitlements: { listings: 25, seats: 3, customDomains: 1, leadExport: false, roundRobin: false, removeBranding: false },
  },
  professional: {
    code: 'professional',
    name: 'Professional',
    tagline: 'For a growing agency with a sales team sharing enquiries.',
    price: { monthly: 5_999_00, yearly: 59_990_00 },
    entitlements: { listings: 150, seats: 10, customDomains: 3, leadExport: true, roundRobin: true, removeBranding: true },
  },
  signature: {
    code: 'signature',
    name: 'Signature',
    tagline: 'For established firms with large inventories and several offices.',
    price: { monthly: 12_999_00, yearly: 1_29_990_00 },
    entitlements: { listings: null, seats: 30, customDomains: 5, leadExport: true, roundRobin: true, removeBranding: true },
  },
};

/** New agencies get the Professional plan free for this long. */
export const TRIAL_DAYS = 14;
export const TRIAL_PLAN: PlanCode = 'professional';
/** After Razorpay gives up retrying a payment (halted), full access continues this long. */
export const HALTED_GRACE_DAYS = 7;

/** Razorpay subscription states, plus "none" before the first checkout. */
export const SUBSCRIPTION_STATUSES = ['none', 'created', 'authenticated', 'active', 'pending', 'halted', 'paused', 'cancelled', 'completed', 'expired'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Billing state stored on the tenant. Dates are ISO strings in DTOs and Date objects in the API. */
export interface BillingState<D = Date> {
  plan: PlanCode | null;
  interval: BillingInterval | null;
  status: SubscriptionStatus;
  trialEndsAt: D | null;
  /** End of the period already paid for (Razorpay current_end). */
  paidThrough: D | null;
  cancelAtPeriodEnd: boolean;
  haltedAt: D | null;
  /** Plan granted by the platform operator without payment, until this date. */
  compPlan: PlanCode | null;
  compUntil: D | null;
  /** A plan change Razorpay will apply at the end of the current period. */
  scheduledPlan: PlanCode | null;
  scheduledInterval: BillingInterval | null;
}

export type AccessState = 'trial' | 'active' | 'past_due' | 'grace' | 'restricted';

export interface Access {
  state: AccessState;
  /** The plan whose limits apply right now (null when restricted). */
  plan: PlanCode | null;
  source: 'trial' | 'subscription' | 'complimentary' | null;
  entitlements: Entitlements;
  /** When the current access ends unless something happens (trial end, grace end, period end). */
  endsAt: Date | null;
}

/** What a restricted agency keeps: its site stays online, but nothing new can be added. */
export const RESTRICTED_ENTITLEMENTS: Entitlements = { listings: 0, seats: 0, customDomains: 0, leadExport: false, roundRobin: false, removeBranding: false };

const DAY = 86_400_000;
const t = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : null);

/** Default billing state for an agency that has never been through checkout. */
export function initialBilling(createdAt: Date): BillingState {
  return {
    plan: null, interval: null, status: 'none', trialEndsAt: new Date(createdAt.getTime() + TRIAL_DAYS * DAY),
    paidThrough: null, cancelAtPeriodEnd: false, haltedAt: null, compPlan: null, compUntil: null, scheduledPlan: null, scheduledInterval: null,
  };
}

/**
 * Decides what an agency may do right now. Pure, so it is unit-tested and shared by API and UI.
 *
 * Order of precedence:
 *   1. A complimentary plan from the platform operator.
 *   2. A paid-up subscription. One set up during the trial (authenticated) starts when the trial
 *      ends, so the agency keeps the trial's Professional features until then.
 *   3. A failed payment Razorpay is still retrying (past_due: full access).
 *   4. A halted subscription, for HALTED_GRACE_DAYS (grace: full access, loud warnings).
 *   5. A cancelled/finished subscription until the end of the period already paid for.
 *   6. The free trial.
 *   7. Otherwise restricted: the website stays online, but nothing new can be added.
 */
export function computeAccess(b: BillingState<Date | string>, now: Date = new Date()): Access {
  const n = now.getTime();
  const full = (state: AccessState, plan: PlanCode, source: Access['source'], endsAt: number | null): Access => ({
    state, plan, source, entitlements: PLANS[plan].entitlements, endsAt: endsAt === null ? null : new Date(endsAt),
  });

  const compUntil = t(b.compUntil);
  if (b.compPlan && compUntil !== null && compUntil > n) return full('active', b.compPlan, 'complimentary', compUntil);

  const paid = t(b.paidThrough);
  if (b.plan) {
    if (b.status === 'active' || b.status === 'authenticated') {
      // Authenticated = mandate set up, first charge scheduled for the end of the trial.
      const trialEnd = t(b.trialEndsAt);
      if (b.status === 'authenticated' && trialEnd !== null && trialEnd > n) return full('trial', TRIAL_PLAN, 'trial', trialEnd);
      return full('active', b.plan, 'subscription', b.cancelAtPeriodEnd ? paid : null);
    }
    if (b.status === 'pending') return full('past_due', b.plan, 'subscription', null);
    if (b.status === 'halted') {
      const graceEnd = (t(b.haltedAt) ?? n) + HALTED_GRACE_DAYS * DAY;
      if (graceEnd > n) return full('grace', b.plan, 'subscription', graceEnd);
    }
    if (paid !== null && paid > n && ['cancelled', 'completed', 'expired', 'paused', 'halted'].includes(b.status)) {
      return full('active', b.plan, 'subscription', paid);
    }
  }

  const trialEnd = t(b.trialEndsAt);
  if (trialEnd !== null && trialEnd > n) return full('trial', TRIAL_PLAN, 'trial', trialEnd);

  return { state: 'restricted', plan: null, source: null, entitlements: RESTRICTED_ENTITLEMENTS, endsAt: null };
}

/** Whether moving between two plans is an upgrade (applied now) or a downgrade (at period end). */
export function planRank(code: PlanCode) {
  return PLAN_CODES.indexOf(code);
}
export function isUpgrade(from: { plan: PlanCode; interval: BillingInterval }, to: { plan: PlanCode; interval: BillingInterval }) {
  if (planRank(to.plan) !== planRank(from.plan)) return planRank(to.plan) > planRank(from.plan);
  return from.interval === 'monthly' && to.interval === 'yearly';
}

export function formatInr(paise: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: paise % 100 ? 2 : 0 }).format(paise / 100);
}

// ---- Request schemas -----------------------------------------------------------------------------

export const checkoutSchema = z.object({ plan: z.enum(PLAN_CODES), interval: z.enum(BILLING_INTERVALS) });
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Razorpay Checkout success handler fields, re-verified on the server. */
export const checkoutVerifySchema = z.object({
  razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]{6,40}$/),
  razorpay_subscription_id: z.string().regex(/^sub_[A-Za-z0-9]{6,40}$/),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/),
});

export const cancelSchema = z.object({ reason: z.string().trim().max(500).default('') });

/** Test mode only: what the simulated payment should do. */
export const simulateSchema = z.object({ subscriptionId: z.string().min(4).max(60), outcome: z.enum(['success', 'failure']) });

/** Platform operator controls. */
export const platformBillingSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('extend-trial'), days: z.number().int().min(1).max(90) }),
  z.object({ action: z.literal('grant'), plan: z.enum(PLAN_CODES), until: z.string().date() }),
  z.object({ action: z.literal('revoke-grant') }),
]);
export type PlatformBillingInput = z.infer<typeof platformBillingSchema>;

export interface BillingUsage {
  listings: number;
  seats: number;
  customDomains: number;
}

/** Shape of GET admin/billing. */
export interface BillingOverview {
  access: { state: AccessState; plan: PlanCode | null; source: Access['source']; endsAt: string | null; entitlements: Entitlements };
  billing: BillingState<string>;
  usage: BillingUsage;
  mode: 'live' | 'test' | 'off';
  keyId: string | null;
  /** Razorpay subscription currently bound to the agency. */
  subscriptionId: string | null;
  payments: Array<{ id: string; amount: number; status: 'captured' | 'failed' | 'refunded'; method: string | null; plan: PlanCode | null; interval: BillingInterval | null; periodStart: string | null; periodEnd: string | null; invoiceUrl: string | null; failureReason: string | null; createdAt: string }>;
}

/** Shape of GET admin/billing/summary (every signed-in member). */
export interface BillingSummary {
  state: AccessState;
  plan: PlanCode | null;
  source: Access['source'];
  endsAt: string | null;
  cancelAtPeriodEnd: boolean;
  /** A subscription is set up (possibly starting when the trial ends). */
  subscribed: boolean;
}
