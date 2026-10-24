import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Logger, ServiceUnavailableException, BadGatewayException } from '@nestjs/common';
import type { Model } from 'mongoose';
import type { BillingInterval } from '@estatery/shared';
import type { Env } from '../../config/env.js';

/** The parts of Razorpay's subscription entity this app relies on. Times are unix seconds. */
export interface RzpSubscription {
  id: string;
  plan_id: string;
  status: 'created' | 'authenticated' | 'active' | 'pending' | 'halted' | 'paused' | 'cancelled' | 'completed' | 'expired';
  current_start: number | null;
  current_end: number | null;
  start_at: number | null;
  charge_at: number | null;
  ended_at?: number | null;
  paid_count: number;
  remaining_count: number | string;
  customer_id: string | null;
  short_url?: string | null;
  has_scheduled_changes?: boolean;
  notes: Record<string, string> | unknown[];
}

export interface RzpPayment {
  id: string;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  method: string | null;
  invoice_id: string | null;
  subscription_id?: string | null;
  error_description?: string | null;
  notes?: Record<string, string> | unknown[];
  created_at: number;
}

export interface CreateSubscriptionInput {
  planId: string;
  totalCount: number;
  /** Unix seconds; defers the first charge (used during a free trial). */
  startAt?: number;
  notes: Record<string, string>;
}

export interface RazorpayGateway {
  readonly mode: 'live' | 'test';
  /** Public key id for Razorpay Checkout (null in the simulator). */
  readonly keyId: string | null;
  readonly webhookSecret: string;
  createPlan(input: { name: string; description: string; amount: number; interval: BillingInterval; notes: Record<string, string> }): Promise<{ id: string }>;
  createSubscription(input: CreateSubscriptionInput): Promise<RzpSubscription>;
  fetchSubscription(id: string): Promise<RzpSubscription>;
  updateSubscription(id: string, input: { planId: string; scheduleChangeAt: 'now' | 'cycle_end' }): Promise<RzpSubscription>;
  cancelSubscription(id: string, atCycleEnd: boolean): Promise<RzpSubscription>;
  cancelScheduledChanges(id: string): Promise<RzpSubscription>;
  fetchInvoice(id: string): Promise<{ short_url: string | null }>;
  /** Checkout success: HMAC_SHA256(payment_id + "|" + subscription_id, key_secret). */
  verifyCheckoutSignature(paymentId: string, subscriptionId: string, signature: string): boolean;
}

export function hmacHex(secret: string, data: string) {
  return createHmac('sha256', secret).update(data).digest('hex');
}

/** Constant-time comparison of two hex signatures. */
export function signatureMatches(expectedHex: string, givenHex: string) {
  if (!/^[a-f0-9]{64}$/i.test(givenHex)) return false;
  const a = Buffer.from(expectedHex, 'hex');
  const b = Buffer.from(givenHex.toLowerCase(), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export class RazorpayApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

/** Razorpay REST API (https://razorpay.com/docs/api/payments/subscriptions/). */
export class HttpRazorpayGateway implements RazorpayGateway {
  readonly mode = 'live' as const;
  private readonly logger = new Logger('Razorpay');
  private readonly auth: string;
  readonly keyId: string;
  readonly webhookSecret: string;
  private readonly keySecret: string;

  constructor(env: Env, private readonly base = 'https://api.razorpay.com/v1') {
    this.keyId = env.RAZORPAY_KEY_ID!;
    this.keySecret = env.RAZORPAY_KEY_SECRET!;
    this.webhookSecret = env.RAZORPAY_WEBHOOK_SECRET!;
    this.auth = `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        headers: { authorization: this.auth, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      this.logger.error(`${method} ${path} failed: ${(e as Error).message}`);
      throw new ServiceUnavailableException({ code: 'PAYMENTS_UNAVAILABLE', message: 'We couldn’t reach our payment provider. Please try again in a minute.' });
    }
    const json = (await res.json().catch(() => ({}))) as { error?: { code?: string; description?: string } };
    if (!res.ok) {
      const description = json.error?.description ?? `Razorpay returned ${res.status}`;
      this.logger.warn(`${method} ${path} → ${res.status} ${json.error?.code ?? ''} ${description}`);
      throw new RazorpayApiError(res.status, json.error?.code ?? 'RAZORPAY_ERROR', description);
    }
    return json as T;
  }

  createPlan(i: { name: string; description: string; amount: number; interval: BillingInterval; notes: Record<string, string> }) {
    return this.call<{ id: string }>('POST', '/plans', {
      period: i.interval, interval: 1, notes: i.notes,
      item: { name: i.name, amount: i.amount, currency: 'INR', description: i.description },
    });
  }

  createSubscription(i: CreateSubscriptionInput) {
    return this.call<RzpSubscription>('POST', '/subscriptions', {
      plan_id: i.planId, total_count: i.totalCount, quantity: 1, customer_notify: 1, notes: i.notes,
      ...(i.startAt ? { start_at: i.startAt } : {}),
    });
  }

  fetchSubscription(id: string) {
    return this.call<RzpSubscription>('GET', `/subscriptions/${encodeURIComponent(id)}`);
  }

  updateSubscription(id: string, i: { planId: string; scheduleChangeAt: 'now' | 'cycle_end' }) {
    return this.call<RzpSubscription>('PATCH', `/subscriptions/${encodeURIComponent(id)}`, { plan_id: i.planId, schedule_change_at: i.scheduleChangeAt, customer_notify: 1 });
  }

  cancelSubscription(id: string, atCycleEnd: boolean) {
    return this.call<RzpSubscription>('POST', `/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 });
  }

  cancelScheduledChanges(id: string) {
    return this.call<RzpSubscription>('POST', `/subscriptions/${encodeURIComponent(id)}/cancel_scheduled_changes`);
  }

  async fetchInvoice(id: string) {
    const inv = await this.call<{ short_url?: string | null }>('GET', `/invoices/${encodeURIComponent(id)}`);
    return { short_url: inv.short_url ?? null };
  }

  verifyCheckoutSignature(paymentId: string, subscriptionId: string, signature: string) {
    return signatureMatches(hmacHex(this.keySecret, `${paymentId}|${subscriptionId}`), signature);
  }
}

const now = () => Math.floor(Date.now() / 1000);
const rid = (prefix: string) => `${prefix}_${randomBytes(7).toString('base64url').replace(/[-_]/g, 'x')}`;

/** End of one billing period after `start` (calendar month or year, like Razorpay). */
export function addPeriod(start: number, interval: BillingInterval) {
  const d = new Date(start * 1000);
  if (interval === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return Math.floor(d.getTime() / 1000);
}

/**
 * Local stand-in for Razorpay (development and tests, never production). Subscriptions are
 * stored in the database so they survive restarts. The billing service turns simulated payments
 * into signed webhook events that go through exactly the same handler as real ones.
 */
export class SimulatedRazorpayGateway implements RazorpayGateway {
  readonly mode = 'test' as const;
  readonly keyId = null;
  readonly webhookSecret: string;
  private readonly checkoutSecret: string;

  constructor(env: Env, private readonly subs: Model<any>) {
    if (env.NODE_ENV === 'production') throw new Error('The payment simulator must never run in production');
    this.webhookSecret = hmacHex(env.INTERNAL_API_KEY, 'billing-simulator-webhook');
    this.checkoutSecret = hmacHex(env.INTERNAL_API_KEY, 'billing-simulator-checkout');
  }

  private async load(id: string): Promise<RzpSubscription> {
    const doc = await this.subs.findOne({ subId: id }).lean<any>();
    if (!doc) throw new RazorpayApiError(400, 'BAD_REQUEST_ERROR', 'The id provided does not exist');
    return doc.entity as RzpSubscription;
  }

  private async save(s: RzpSubscription) {
    await this.subs.updateOne({ subId: s.id }, { $set: { subId: s.id, entity: s } }, { upsert: true });
    return s;
  }

  async createPlan() {
    return { id: rid('plan') };
  }

  async createSubscription(i: CreateSubscriptionInput) {
    return this.save({
      id: rid('sub'), plan_id: i.planId, status: 'created', current_start: null, current_end: null, start_at: i.startAt ?? null,
      charge_at: i.startAt ?? now(), paid_count: 0, remaining_count: i.totalCount, customer_id: null, short_url: null, has_scheduled_changes: false, notes: i.notes,
    });
  }

  fetchSubscription(id: string) {
    return this.load(id);
  }

  /** Simulator transitions, driven by BillingService.simulate(). */
  async transition(id: string, fn: (s: RzpSubscription) => RzpSubscription) {
    return this.save(fn(await this.load(id)));
  }

  async updateSubscription(id: string, i: { planId: string; scheduleChangeAt: 'now' | 'cycle_end' }) {
    return this.transition(id, (s) => (i.scheduleChangeAt === 'now'
      ? { ...s, plan_id: i.planId, has_scheduled_changes: false }
      : { ...s, has_scheduled_changes: true, notes: { ...(s.notes as Record<string, string>), scheduled_plan_id: i.planId } }));
  }

  async cancelSubscription(id: string, atCycleEnd: boolean) {
    return this.transition(id, (s) => (atCycleEnd ? s : { ...s, status: 'cancelled', ended_at: now() }));
  }

  async cancelScheduledChanges(id: string) {
    return this.transition(id, (s) => ({ ...s, has_scheduled_changes: false, notes: { ...(s.notes as Record<string, string>), scheduled_plan_id: '' } }));
  }

  async fetchInvoice() {
    return { short_url: null };
  }

  /** The simulated checkout signs with its own secret, so the verify path is exercised too. */
  signCheckout(paymentId: string, subscriptionId: string) {
    return hmacHex(this.checkoutSecret, `${paymentId}|${subscriptionId}`);
  }

  verifyCheckoutSignature(paymentId: string, subscriptionId: string, signature: string) {
    return signatureMatches(this.signCheckout(paymentId, subscriptionId), signature);
  }

  newPaymentId() {
    return rid('pay');
  }
}
