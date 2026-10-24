import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { isValidObjectId, Types, type Model } from 'mongoose';
import {
  computeAccess, formatInr, isUpgrade, PLANS, TRIAL_DAYS,
  type BillingInterval, type BillingOverview, type BillingSummary, type PlanCode, type PlatformBillingInput,
} from '@estatery/shared';
import { billingMode, loadEnv } from '../../config/env.js';
import type { ResolvedTenant } from '../../common/tenancy/tenant.context.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.guard.js';
import { QueueService } from '../jobs/queue.service.js';
import type { MailMessage } from '../mail/mail.service.js';
import { billingOf, EntitlementsService } from './entitlements.service.js';
import {
  addPeriod, hmacHex, HttpRazorpayGateway, RazorpayApiError, signatureMatches, SimulatedRazorpayGateway,
  type RazorpayGateway, type RzpPayment, type RzpSubscription,
} from './razorpay.gateway.js';

/** Long enough to feel open-ended; Razorpay needs a finite number of billing cycles. */
const TOTAL_COUNT: Record<BillingInterval, number> = { monthly: 120, yearly: 10 };
const LIVE_STATUSES = ['authenticated', 'active', 'pending', 'halted'] as const;
const sec = (d: Date) => Math.floor(d.getTime() / 1000);
const fromSec = (s: number | null | undefined) => (s ? new Date(s * 1000) : null);
const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

interface WebhookEvent {
  entity: 'event';
  event: string;
  contains?: string[];
  created_at: number;
  payload: {
    subscription?: { entity: RzpSubscription };
    payment?: { entity: RzpPayment };
  };
}

export interface WebhookResult {
  status: 'processed' | 'duplicate' | 'ignored';
  note?: string;
}

const actor = (a: AuthContext) => ({ id: a.userId, name: a.name });

@Injectable()
export class BillingService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Billing');
  private readonly env = loadEnv();
  readonly mode = billingMode(this.env);
  readonly gateway: RazorpayGateway | null;

  constructor(
    @InjectModel('Tenant') private readonly tenants: Model<any>,
    @InjectModel('BillingPlan') private readonly plans: Model<any>,
    @InjectModel('BillingEvent') private readonly events: Model<any>,
    @InjectModel('BillingPayment') private readonly payments: Model<any>,
    @InjectModel('BillingSimSubscription') simSubs: Model<any>,
    @InjectModel('Membership') private readonly memberships: Model<any>,
    @InjectModel('User') private readonly users: Model<any>,
    @InjectModel('Domain') private readonly domains: Model<any>,
    private readonly entitlements: EntitlementsService,
    private readonly queue: QueueService,
    private readonly audit: AuditService,
  ) {
    this.gateway = this.mode === 'live' ? new HttpRazorpayGateway(this.env) : this.mode === 'test' ? new SimulatedRazorpayGateway(this.env, simSubs) : null;
  }

  onApplicationBootstrap() {
    this.queue.register('billing.notices', () => this.sendNotices().then(() => undefined));
    this.queue.register('billing.reconcile', () => this.reconcile().then(() => undefined));
    this.queue.register('billing.invoice', (d: { paymentId: string }) => this.fetchInvoiceUrl(d.paymentId));
    if (this.env.NODE_ENV !== 'test') {
      this.queue.repeat('billing.notices', 60 * 60_000);
      if (this.mode === 'live' && this.env.BILLING_RECONCILE_MINUTES > 0) this.queue.repeat('billing.reconcile', this.env.BILLING_RECONCILE_MINUTES * 60_000);
    }
  }

  private requireGateway(): RazorpayGateway {
    if (!this.gateway) {
      throw new ServiceUnavailableException({ code: 'PAYMENTS_OFF', message: 'Online payments aren’t set up on this platform yet. Please contact the platform team.' });
    }
    return this.gateway;
  }

  private async tenantDoc(tenantId: Types.ObjectId) {
    const t = await this.tenants.findById(tenantId, { name: 1, slug: 1, billing: 1, createdAt: 1 }).lean<any>();
    if (!t) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Agency not found.' });
    return t;
  }

  /** Writes billing fields with dotted paths, creating the subdocument from defaults if needed. */
  private async setBilling(tenantId: Types.ObjectId, set: Record<string, unknown>, filter: Record<string, unknown> = {}) {
    const t = await this.tenants.findById(tenantId, { billing: 1, createdAt: 1 }).lean<any>();
    if (t && !t.billing) {
      await this.tenants.updateOne({ _id: tenantId, billing: null }, { $set: { billing: { ...billingOf(t), lastEventAt: 0, checkout: {}, notices: {} } } });
    }
    const $set = Object.fromEntries(Object.entries(set).map(([k, v]) => [`billing.${k}`, v]));
    return this.tenants.updateOne({ _id: tenantId, ...filter }, { $set });
  }

  // ---- Reading ---------------------------------------------------------------------------------

  async summary(tenantId: Types.ObjectId): Promise<BillingSummary> {
    const b = billingOf(await this.tenantDoc(tenantId));
    const a = computeAccess(b);
    const subscribed = !!b.plan && (LIVE_STATUSES as readonly string[]).includes(b.status);
    return { state: a.state, plan: a.plan, source: a.source, endsAt: iso(a.endsAt), cancelAtPeriodEnd: b.cancelAtPeriodEnd, subscribed };
  }

  async overview(tenantId: Types.ObjectId): Promise<BillingOverview> {
    const t = await this.tenantDoc(tenantId);
    const b = billingOf(t);
    const a = computeAccess(b);
    const [usage, payments] = await Promise.all([
      this.entitlements.usage(tenantId),
      this.payments.find({ tenantId }).sort({ paidAt: -1 }).limit(24).lean<any[]>(),
    ]);
    return {
      access: { state: a.state, plan: a.plan, source: a.source, endsAt: iso(a.endsAt), entitlements: a.entitlements },
      billing: {
        ...b,
        trialEndsAt: iso(b.trialEndsAt), paidThrough: iso(b.paidThrough), haltedAt: iso(b.haltedAt), compUntil: iso(b.compUntil),
      },
      usage,
      mode: this.mode,
      keyId: this.gateway?.keyId ?? null,
      subscriptionId: t.billing?.subscriptionId ?? null,
      payments: payments.map((p) => ({
        id: p._id.toString(), amount: p.amount, status: p.status, method: p.method, plan: p.plan, interval: p.interval,
        periodStart: iso(p.periodStart), periodEnd: iso(p.periodEnd), invoiceUrl: p.invoiceUrl, failureReason: p.failureReason, createdAt: iso(p.paidAt)!,
      })),
    };
  }

  // ---- Razorpay plans ----------------------------------------------------------------------------

  /** Razorpay plan id for a plan/interval at today's price, created on first use. */
  private async razorpayPlanId(code: PlanCode, interval: BillingInterval) {
    const gw = this.requireGateway();
    const amount = PLANS[code].price[interval];
    const keyId = gw.keyId ?? 'simulator';
    const existing = await this.plans.findOne({ code, interval, amount, keyId }).lean<any>();
    if (existing) return existing.razorpayPlanId as string;
    const created = await gw.createPlan({
      name: `${this.env.PLATFORM_NAME} ${PLANS[code].name} (${interval})`,
      description: PLANS[code].tagline, amount, interval, notes: { code, interval },
    });
    try {
      await this.plans.create({ code, interval, amount, mode: gw.mode, keyId, razorpayPlanId: created.id });
      return created.id;
    } catch {
      // Two requests raced to create the same plan; use whichever was stored first.
      return ((await this.plans.findOne({ code, interval, amount, keyId }).lean<any>())?.razorpayPlanId as string) ?? created.id;
    }
  }

  private async planFor(razorpayPlanId: string): Promise<{ code: PlanCode; interval: BillingInterval } | null> {
    const p = await this.plans.findOne({ razorpayPlanId }).lean<any>();
    return p ? { code: p.code, interval: p.interval } : null;
  }

  // ---- Checkout ----------------------------------------------------------------------------------

  async checkout(tenant: ResolvedTenant, a: AuthContext, input: { plan: PlanCode; interval: BillingInterval }, ip: string | null) {
    const gw = this.requireGateway();
    const t = await this.tenantDoc(tenant.id);
    const b = billingOf(t);
    if (t.billing?.subscriptionId && (LIVE_STATUSES as readonly string[]).includes(b.status)) {
      throw new ConflictException({ code: 'ALREADY_SUBSCRIBED', message: 'You already have a subscription. Change your plan instead of starting a new one.' });
    }
    const planId = await this.razorpayPlanId(input.plan, input.interval);
    // During the free trial the first charge is deferred to the trial's end (card/UPI mandate is set up now).
    const trialEnd = b.trialEndsAt ? new Date(b.trialEndsAt).getTime() : 0;
    const startAt = trialEnd > Date.now() + 60 * 60_000 ? Math.floor(trialEnd / 1000) : undefined;
    const sub = await gw.createSubscription({
      planId, totalCount: TOTAL_COUNT[input.interval], startAt,
      notes: { tenantId: tenant.id.toString(), plan: input.plan, interval: input.interval },
    }).catch((e) => this.rethrow(e, 'start the subscription'));

    await this.setBilling(tenant.id, { checkout: { subscriptionId: sub.id, plan: input.plan, interval: input.interval, createdAt: new Date() } });
    await this.audit.record({
      tenantId: tenant.id, actor: actor(a), action: 'billing.checkout_started', targetType: 'subscription', targetId: sub.id,
      summary: `Started checkout for ${PLANS[input.plan].name} (${input.interval})`, ip,
    });
    const user = await this.users.findById(a.userId, { name: 1, email: 1 }).lean<any>();
    return {
      mode: gw.mode, keyId: gw.keyId, subscriptionId: sub.id, plan: input.plan, interval: input.interval,
      amount: PLANS[input.plan].price[input.interval], firstChargeAt: startAt ? new Date(startAt * 1000).toISOString() : null,
      name: this.env.PLATFORM_NAME, description: `${PLANS[input.plan].name} plan for ${tenant.name}`,
      prefill: { name: user?.name ?? '', email: user?.email ?? '' },
    };
  }

  /**
   * Razorpay Checkout's success handler posts here. The signature proves the payment came from
   * Razorpay for this subscription; the subscription itself is then fetched from Razorpay rather
   * than trusting anything else from the browser. Webhooks remain the source of truth after that.
   */
  async verifyCheckout(tenant: ResolvedTenant, a: AuthContext, input: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }, ip: string | null) {
    const gw = this.requireGateway();
    const t = await this.tenantDoc(tenant.id);
    const subId = input.razorpay_subscription_id;
    const pending = t.billing?.checkout?.subscriptionId === subId;
    const bound = t.billing?.subscriptionId === subId;
    if (!pending && !bound) {
      throw new BadRequestException({ code: 'UNKNOWN_SUBSCRIPTION', message: 'This payment doesn’t match the checkout you started. Please start again.' });
    }
    if (!gw.verifyCheckoutSignature(input.razorpay_payment_id, subId, input.razorpay_signature)) {
      this.logger.warn(`Checkout signature mismatch for tenant ${tenant.id} (${subId})`);
      throw new BadRequestException({ code: 'BAD_SIGNATURE', message: 'We couldn’t confirm this payment. If money was taken, it will be confirmed automatically within a few minutes.' });
    }
    // The webhook may already have confirmed it; otherwise ask Razorpay directly.
    if (pending) {
      const sub = await gw.fetchSubscription(subId).catch((e) => this.rethrow(e, 'confirm the subscription'));
      await this.applySubscription(tenant.id, sub, null);
    }
    const b = billingOf(await this.tenantDoc(tenant.id));
    await this.audit.record({
      tenantId: tenant.id, actor: actor(a), action: 'billing.subscribed', targetType: 'subscription', targetId: subId,
      summary: b.plan ? `Subscribed to ${PLANS[b.plan].name} (${b.interval})` : 'Completed checkout', ip,
    });
    return this.summary(tenant.id);
  }

  async changePlan(tenant: ResolvedTenant, a: AuthContext, input: { plan: PlanCode; interval: BillingInterval }, ip: string | null) {
    const gw = this.requireGateway();
    const t = await this.tenantDoc(tenant.id);
    const b = billingOf(t);
    const subId: string | null = t.billing?.subscriptionId ?? null;
    if (!subId || !b.plan || !b.interval || !(LIVE_STATUSES as readonly string[]).includes(b.status)) {
      throw new BadRequestException({ code: 'NO_SUBSCRIPTION', message: 'There’s no active subscription to change. Choose a plan to subscribe.' });
    }
    if (b.plan === input.plan && b.interval === input.interval) {
      if (b.scheduledPlan) return this.cancelScheduledChange(tenant, a, ip);
      throw new BadRequestException({ code: 'SAME_PLAN', message: 'You’re already on this plan.' });
    }
    if (b.status === 'pending' || b.status === 'halted') {
      throw new BadRequestException({ code: 'PAYMENT_DUE', message: 'Your last payment didn’t go through. Settle it before changing plans.' });
    }
    const planId = await this.razorpayPlanId(input.plan, input.interval);

    // Mandate set up but nothing charged yet (still in the trial): replace the subscription.
    if (b.status === 'authenticated') {
      await gw.cancelSubscription(subId, false).catch((e) => this.rethrow(e, 'change the plan'));
      await this.setBilling(tenant.id, { status: 'cancelled', plan: null, interval: null, subscriptionId: null, cancelAtPeriodEnd: false });
      await this.audit.record({ tenantId: tenant.id, actor: actor(a), action: 'billing.plan_changed', targetType: 'subscription', targetId: subId, summary: `Switched to ${PLANS[input.plan].name} (${input.interval}) before the first charge`, ip });
      return { restartCheckout: true, ...(await this.checkout(tenant, a, input, ip)) };
    }

    const upgrade = isUpgrade({ plan: b.plan, interval: b.interval }, input);
    const sub = await gw.updateSubscription(subId, { planId, scheduleChangeAt: upgrade ? 'now' : 'cycle_end' }).catch((e) => {
      if (e instanceof RazorpayApiError) {
        throw new BadRequestException({
          code: 'PLAN_CHANGE_FAILED',
          message: `Razorpay couldn’t change the plan (${e.message}). Some payment methods, such as UPI AutoPay, don’t allow changes: cancel at the end of this period and subscribe to the new plan instead.`,
        });
      }
      throw e;
    });
    if (upgrade) {
      await this.applySubscription(tenant.id, sub, null);
      await this.setBilling(tenant.id, { scheduledPlan: null, scheduledInterval: null });
    } else {
      await this.setBilling(tenant.id, { scheduledPlan: input.plan, scheduledInterval: input.interval });
    }
    await this.audit.record({
      tenantId: tenant.id, actor: actor(a), action: 'billing.plan_changed', targetType: 'subscription', targetId: subId,
      summary: upgrade
        ? `Upgraded to ${PLANS[input.plan].name} (${input.interval}), effective now`
        : `Scheduled a change to ${PLANS[input.plan].name} (${input.interval}) from the next billing date`, ip,
    });
    if (gw instanceof SimulatedRazorpayGateway && upgrade) await this.emit('subscription.updated', { subscription: sub });
    return { restartCheckout: false, scheduled: !upgrade, summary: await this.summary(tenant.id) };
  }

  private async cancelScheduledChange(tenant: ResolvedTenant, a: AuthContext, ip: string | null) {
    const t = await this.tenantDoc(tenant.id);
    await this.requireGateway().cancelScheduledChanges(t.billing.subscriptionId).catch((e) => this.rethrow(e, 'keep your current plan'));
    await this.setBilling(tenant.id, { scheduledPlan: null, scheduledInterval: null });
    await this.audit.record({ tenantId: tenant.id, actor: actor(a), action: 'billing.plan_changed', summary: 'Kept the current plan (cancelled the scheduled change)', ip });
    return { restartCheckout: false, scheduled: false, summary: await this.summary(tenant.id) };
  }

  async cancel(tenant: ResolvedTenant, a: AuthContext, input: { reason: string }, ip: string | null) {
    const gw = this.requireGateway();
    const t = await this.tenantDoc(tenant.id);
    const b = billingOf(t);
    const subId: string | null = t.billing?.subscriptionId ?? null;
    if (!subId || !(LIVE_STATUSES as readonly string[]).includes(b.status)) {
      throw new BadRequestException({ code: 'NO_SUBSCRIPTION', message: 'There’s no active subscription to cancel.' });
    }
    if (b.cancelAtPeriodEnd) return this.summary(tenant.id);
    // Paid and current: keep access until the period ends. Anything else stops now (nothing more is owed).
    const atCycleEnd = b.status === 'active';
    const sub = await gw.cancelSubscription(subId, atCycleEnd).catch((e) => this.rethrow(e, 'cancel the subscription'));
    if (atCycleEnd) await this.setBilling(tenant.id, { cancelAtPeriodEnd: true, scheduledPlan: null, scheduledInterval: null });
    else await this.applySubscription(tenant.id, sub, null);
    await this.audit.record({
      tenantId: tenant.id, actor: actor(a), action: 'billing.cancelled', targetType: 'subscription', targetId: subId,
      summary: `Cancelled the subscription${atCycleEnd && b.paidThrough ? `, effective ${b.paidThrough.toISOString().slice(0, 10)}` : ''}${input.reason ? ` — “${input.reason}”` : ''}`, ip,
    });
    if (gw instanceof SimulatedRazorpayGateway && !atCycleEnd) await this.emit('subscription.cancelled', { subscription: sub });
    return this.summary(tenant.id);
  }

  private rethrow(e: unknown, what: string): never {
    if (e instanceof RazorpayApiError) {
      throw new BadRequestException({ code: 'RAZORPAY_ERROR', message: `Razorpay couldn’t ${what}: ${e.message}` });
    }
    throw e;
  }

  // ---- Webhooks ----------------------------------------------------------------------------------

  /**
   * Razorpay webhook entry point (forwarded by the web server with the raw body).
   *  1. HMAC-SHA256 of the exact raw body with the webhook secret must match X-Razorpay-Signature.
   *  2. The event id is claimed with a unique index: retries and replays are acknowledged and skipped.
   *  3. Subscription state is only moved forward in time (created_at), so late events can't undo newer ones.
   * A processing error marks the event failed and returns 500, so Razorpay retries it.
   */
  async handleWebhook(raw: string, signature: string | undefined, eventIdHeader: string | undefined): Promise<WebhookResult> {
    const gw = this.gateway;
    if (!gw) throw new NotFoundException();
    if (!signature || !signatureMatches(hmacHex(gw.webhookSecret, raw), signature)) {
      this.logger.warn('Rejected a webhook with a missing or invalid signature');
      throw new BadRequestException({ code: 'BAD_SIGNATURE', message: 'Invalid signature' });
    }
    let evt: WebhookEvent;
    try {
      evt = JSON.parse(raw) as WebhookEvent;
    } catch {
      throw new BadRequestException({ code: 'BAD_PAYLOAD', message: 'Malformed JSON' });
    }
    if (evt?.entity !== 'event' || typeof evt.event !== 'string') throw new BadRequestException({ code: 'BAD_PAYLOAD', message: 'Not a Razorpay event' });
    const eventId = eventIdHeader && /^[A-Za-z0-9_-]{4,80}$/.test(eventIdHeader) ? eventIdHeader : `sha256_${createHash('sha256').update(raw).digest('hex')}`;

    if (!(await this.claim(eventId, evt))) return { status: 'duplicate' };
    try {
      const r = await this.apply(evt);
      await this.events.updateOne({ eventId }, { $set: { status: r.status, note: r.note ?? null, tenantId: r.tenantId ?? null, processedAt: new Date(), error: null } });
      return { status: r.status, note: r.note };
    } catch (e) {
      await this.events.updateOne({ eventId }, { $set: { status: 'failed', error: (e as Error).message.slice(0, 500) } });
      this.logger.error(`Webhook ${evt.event} (${eventId}) failed: ${(e as Error).message}`);
      throw e;
    }
  }

  /** True if this delivery should be processed now (first time, or retry after a failure/crash). */
  private async claim(eventId: string, evt: WebhookEvent) {
    try {
      await this.events.create({
        eventId, event: evt.event, status: 'processing', createdAtRzp: evt.created_at ?? 0,
        subscriptionId: evt.payload?.subscription?.entity?.id ?? evt.payload?.payment?.entity?.subscription_id ?? null,
      });
      return true;
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
      const stale = new Date(Date.now() - 5 * 60_000);
      const retried = await this.events.findOneAndUpdate(
        { eventId, $or: [{ status: 'failed' }, { status: 'processing', updatedAt: { $lt: stale } }] },
        { $set: { status: 'processing' }, $inc: { attempts: 1 } },
      ).lean();
      return !!retried;
    }
  }

  private async apply(evt: WebhookEvent): Promise<{ status: 'processed' | 'ignored'; note?: string; tenantId?: Types.ObjectId }> {
    const sub = evt.payload?.subscription?.entity;
    const pay = evt.payload?.payment?.entity;
    const subId = sub?.id ?? pay?.subscription_id ?? null;
    if (!subId) return { status: 'ignored', note: 'Not a subscription event' };

    const tenant = await this.tenantForSubscription(subId, sub);
    if (!tenant) return { status: 'ignored', note: `No agency for ${subId}` };
    const tenantId: Types.ObjectId = tenant._id;
    const bound = tenant.billing?.subscriptionId === subId || tenant.billing?.checkout?.subscriptionId === subId;

    if (sub && bound) await this.applySubscription(tenantId, sub, evt.created_at);
    else if (sub && !bound) this.logger.log(`Event ${evt.event} for superseded subscription ${subId}: state left unchanged`);

    switch (evt.event) {
      case 'subscription.charged':
        if (pay) await this.recordPayment(tenantId, pay, sub ?? null, 'captured');
        break;
      case 'payment.failed':
        if (pay) await this.recordPayment(tenantId, pay, sub ?? null, 'failed');
        break;
      case 'subscription.pending':
        if (bound) await this.notifyOwners(tenantId, 'payment-failed');
        break;
      case 'subscription.halted':
        if (bound) await this.notifyOwners(tenantId, 'halted');
        break;
      case 'subscription.cancelled':
        if (bound) await this.notifyOwners(tenantId, 'cancelled');
        break;
      default:
        break;
    }
    return { status: 'processed', tenantId, note: bound ? undefined : 'Superseded subscription' };
  }

  private async tenantForSubscription(subId: string, sub?: RzpSubscription) {
    const bySub = await this.tenants.findOne({ $or: [{ 'billing.subscriptionId': subId }, { 'billing.checkout.subscriptionId': subId }] }, { billing: 1, name: 1 }).lean<any>();
    if (bySub) return bySub;
    // A subscription we created always carries the tenant id in its notes.
    const notes = sub && !Array.isArray(sub.notes) ? sub.notes : {};
    const tid = notes.tenantId;
    if (tid && isValidObjectId(tid)) {
      const t = await this.tenants.findById(tid, { billing: 1, name: 1 }).lean<any>();
      // Payments recorded against an old subscription of this tenant still belong to it.
      if (t) return t;
    }
    return null;
  }

  /**
   * Copies Razorpay's view of a subscription onto the tenant. With an event timestamp, the write
   * only happens if it is not older than the last event applied (out-of-order delivery is common).
   */
  async applySubscription(tenantId: Types.ObjectId, sub: RzpSubscription, eventCreatedAt: number | null) {
    const plan = await this.planFor(sub.plan_id);
    const t = await this.tenants.findById(tenantId, { billing: 1, createdAt: 1 }).lean<any>();
    const prev = billingOf(t ?? {});
    const set: Record<string, unknown> = {
      status: sub.status,
      subscriptionId: sub.id,
      customerId: sub.customer_id ?? t?.billing?.customerId ?? null,
      paidThrough: fromSec(sub.current_end) ?? prev.paidThrough,
      haltedAt: sub.status === 'halted' ? (prev.haltedAt ?? new Date()) : null,
    };
    if (plan) Object.assign(set, { plan: plan.code, interval: plan.interval });
    if (['cancelled', 'completed', 'expired'].includes(sub.status)) Object.assign(set, { cancelAtPeriodEnd: false, scheduledPlan: null, scheduledInterval: null });
    if (sub.has_scheduled_changes === false && plan && prev.scheduledPlan === plan.code) Object.assign(set, { scheduledPlan: null, scheduledInterval: null });
    if (t?.billing?.checkout?.subscriptionId === sub.id && sub.status !== 'created') set.checkout = { subscriptionId: null, plan: null, interval: null, createdAt: null };
    if (sub.status === 'created') {
      // Abandoned or not-yet-paid checkout: nothing changes for the agency.
      return;
    }
    if (eventCreatedAt !== null) {
      set.lastEventAt = eventCreatedAt;
      const r = await this.setBilling(tenantId, set, { $or: [{ 'billing.lastEventAt': { $lte: eventCreatedAt } }, { 'billing.lastEventAt': null }] });
      if (r.matchedCount === 0) this.logger.log(`Skipped an older ${sub.status} update for ${sub.id}`);
    } else {
      await this.setBilling(tenantId, set);
    }
  }

  private async recordPayment(tenantId: Types.ObjectId, pay: RzpPayment, sub: RzpSubscription | null, status: 'captured' | 'failed') {
    const plan = sub ? await this.planFor(sub.plan_id) : null;
    const res = await this.payments.updateOne(
      { tenantId, paymentId: pay.id },
      {
        $set: { status, failureReason: status === 'failed' ? (pay.error_description ?? 'The payment was declined') : null },
        $setOnInsert: {
          tenantId, paymentId: pay.id, subscriptionId: sub?.id ?? pay.subscription_id ?? null, amount: pay.amount, currency: pay.currency ?? 'INR',
          method: pay.method ?? null, plan: plan?.code ?? null, interval: plan?.interval ?? null,
          periodStart: status === 'captured' ? fromSec(sub?.current_start) : null, periodEnd: status === 'captured' ? fromSec(sub?.current_end) : null,
          invoiceId: pay.invoice_id ?? null, invoiceUrl: null, paidAt: fromSec(pay.created_at) ?? new Date(),
        },
      },
      { upsert: true },
    );
    if (status === 'captured' && res.upsertedCount) {
      if (pay.invoice_id) await this.queue.enqueue('billing.invoice', { paymentId: pay.id });
      await this.notifyOwners(tenantId, 'receipt', { amount: pay.amount, plan: plan?.code ?? null, periodEnd: fromSec(sub?.current_end) });
    }
  }

  private async fetchInvoiceUrl(paymentId: string) {
    const p = await this.payments.findOne({ paymentId }).setOptions({ crossTenant: true }).lean<any>();
    if (!p?.invoiceId || p.invoiceUrl || !this.gateway) return;
    const inv = await this.gateway.fetchInvoice(p.invoiceId);
    if (inv.short_url) await this.payments.updateOne({ tenantId: p.tenantId, _id: p._id }, { $set: { invoiceUrl: inv.short_url } });
  }

  // ---- Emails ------------------------------------------------------------------------------------

  private async ownerEmails(tenantId: Types.ObjectId) {
    const owners = await this.memberships.find({ tenantId, role: 'owner', status: 'active' }, { userId: 1 }).lean<any[]>();
    const users = await this.users.find({ _id: { $in: owners.map((o) => o.userId) } }, { email: 1 }).lean<any[]>();
    return users.map((u) => u.email as string).filter(Boolean);
  }

  private async billingUrl(tenantId: Types.ObjectId) {
    const d = (await this.domains.findOne({ tenantId, isPrimary: true }, { hostname: 1 }).lean<any>()) ?? (await this.domains.findOne({ tenantId, verified: true }, { hostname: 1 }).lean<any>());
    const host: string = d?.hostname ?? 'localhost';
    const local = /(^|\.)localhost$|^127\./.test(host);
    return `${local ? 'http' : 'https'}://${host}${local ? `:${this.env.DEV_WEB_PORT}` : ''}/admin/billing`;
  }

  async notifyOwners(tenantId: Types.ObjectId, kind: 'receipt' | 'payment-failed' | 'halted' | 'cancelled' | 'trial-ending', extra: { amount?: number; plan?: PlanCode | null; periodEnd?: Date | null; endsAt?: Date } = {}) {
    const to = await this.ownerEmails(tenantId);
    if (!to.length) return;
    const t = await this.tenants.findById(tenantId, { name: 1 }).lean<any>();
    const name = t?.name ?? 'your agency';
    const url = await this.billingUrl(tenantId);
    const date = (d: Date | null | undefined) => (d ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'Asia/Kolkata' }).format(d) : '');
    const messages: Record<typeof kind, { subject: string; text: string }> = {
      receipt: {
        subject: `Payment received: ${formatInr(extra.amount ?? 0)} for ${name}`,
        text: `Thank you. We received ${formatInr(extra.amount ?? 0)} for the ${extra.plan ? PLANS[extra.plan].name : ''} plan${extra.periodEnd ? `, covering your site until ${date(extra.periodEnd)}` : ''}.\n\nInvoices and payment history: ${url}`,
      },
      'payment-failed': {
        subject: `Payment failed for ${name}`,
        text: `We couldn’t collect your subscription payment. Razorpay will retry automatically over the next few days, and your site keeps working meanwhile.\n\nIf your card or UPI mandate has changed, open Billing to set up the subscription again: ${url}`,
      },
      halted: {
        subject: `Action needed: ${name}’s subscription is on hold`,
        text: `Repeated payment attempts failed, so the subscription is on hold. Your website stays online, but in 7 days you won’t be able to publish new listings, invite people or connect domains until a plan is active again.\n\nChoose a plan to continue: ${url}`,
      },
      cancelled: {
        subject: `${name}’s subscription has ended`,
        text: `Your subscription is cancelled. Your website and content stay online, but adding new listings, people and domains is paused until you choose a plan again.\n\n${url}`,
      },
      'trial-ending': {
        subject: `Your free trial ends on ${date(extra.endsAt)}`,
        text: `Your ${TRIAL_DAYS}-day trial of ${name} ends on ${date(extra.endsAt)}. Choose a plan to keep publishing listings and inviting your team — your website stays online either way.\n\n${url}`,
      },
    };
    const m = messages[kind];
    await this.queue.enqueue('email.send', { to: to.join(', '), subject: m.subject, text: m.text } satisfies MailMessage);
  }

  /** Hourly: trial-ending reminder (3 days before, once). */
  async sendNotices(now = new Date()) {
    const soon = new Date(now.getTime() + 3 * 86_400_000);
    const candidates = await this.tenants.find({ status: { $ne: 'suspended' } }, { billing: 1, createdAt: 1 }).lean<any[]>();
    let sent = 0;
    for (const t of candidates) {
      const b = billingOf(t);
      const a = computeAccess(b, now);
      if (a.source !== 'trial' || !a.endsAt || a.endsAt > soon || t.billing?.notices?.trialEnding) continue;
      if ((LIVE_STATUSES as readonly string[]).includes(b.status)) continue; // already subscribed
      const claimed = await this.tenants.updateOne(
        { _id: t._id, $or: [{ billing: null }, { 'billing.notices.trialEnding': null }] },
        t.billing ? { $set: { 'billing.notices.trialEnding': now } } : { $set: { billing: { ...b, lastEventAt: 0, checkout: {}, notices: { trialEnding: now } } } },
      );
      if (claimed.modifiedCount) {
        await this.notifyOwners(t._id, 'trial-ending', { endsAt: a.endsAt });
        sent += 1;
      }
    }
    return sent;
  }

  /** Re-sync live subscriptions from Razorpay (covers missed webhooks). */
  async reconcile() {
    if (!(this.gateway instanceof HttpRazorpayGateway)) return 0;
    const ts = await this.tenants.find({ 'billing.subscriptionId': { $ne: null }, 'billing.status': { $in: [...LIVE_STATUSES] } }, { billing: 1 }).lean<any[]>();
    let n = 0;
    for (const t of ts) {
      try {
        const sub = await this.gateway.fetchSubscription(t.billing.subscriptionId);
        if (sub.status !== t.billing.status || (sub.current_end && sec(new Date(t.billing.paidThrough ?? 0)) !== sub.current_end)) {
          await this.applySubscription(t._id, sub, null);
          n += 1;
        }
      } catch (e) {
        this.logger.warn(`Reconcile ${t.billing.subscriptionId} failed: ${(e as Error).message}`);
      }
    }
    if (n) this.logger.log(`Reconciled ${n} subscriptions`);
    return n;
  }

  // ---- Payment simulator (test mode only) ---------------------------------------------------------

  /** Signs an event like Razorpay does and runs it through the real webhook handler. */
  private async emit(event: string, payload: { subscription?: RzpSubscription; payment?: RzpPayment }) {
    const gw = this.gateway as SimulatedRazorpayGateway;
    const body: WebhookEvent = {
      entity: 'event', event, created_at: Math.floor(Date.now() / 1000),
      contains: Object.keys(payload),
      payload: {
        ...(payload.subscription ? { subscription: { entity: payload.subscription } } : {}),
        ...(payload.payment ? { payment: { entity: payload.payment } } : {}),
      },
    };
    const raw = JSON.stringify({ account_id: 'acc_simulator', ...body });
    return this.handleWebhook(raw, hmacHex(gw.webhookSecret, raw), `evt_sim_${gw.newPaymentId().slice(4)}`);
  }

  /**
   * Plays the part of Razorpay for the selected subscription:
   *  - a new checkout: success authorises (and, outside a trial, charges) it; failure declines the payment;
   *  - an active subscription: success charges the next period (a renewal); failure starts dunning
   *    (pending, then halted on a second failure).
   * Returns what Razorpay Checkout would hand the browser, so the verify step runs as in production.
   */
  async simulate(tenant: ResolvedTenant, input: { subscriptionId: string; outcome: 'success' | 'failure' }) {
    if (!(this.gateway instanceof SimulatedRazorpayGateway)) throw new NotFoundException();
    const gw = this.gateway;
    const t = await this.tenantDoc(tenant.id);
    if (input.subscriptionId !== t.billing?.checkout?.subscriptionId && input.subscriptionId !== t.billing?.subscriptionId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'That subscription doesn’t belong to this agency.' });
    }
    const sub = await gw.fetchSubscription(input.subscriptionId);
    const plan = await this.planFor(sub.plan_id);
    if (!plan) throw new BadRequestException({ code: 'UNKNOWN_PLAN', message: 'Unknown plan.' });
    const amount = PLANS[plan.code].price[plan.interval];
    const nowS = Math.floor(Date.now() / 1000);
    const payment = (status: RzpPayment['status'], amt = amount): RzpPayment => ({
      id: gw.newPaymentId(), amount: amt, currency: 'INR', status, method: 'card', invoice_id: null, subscription_id: sub.id, created_at: nowS,
      error_description: status === 'failed' ? 'Your bank declined the payment (simulated).' : null,
    });

    if (input.outcome === 'failure') {
      const p = payment('failed');
      if (sub.status === 'created') {
        await this.emit('payment.failed', { payment: p, subscription: sub });
        return { outcome: 'failure' as const, message: 'The payment was declined. No money was taken.' };
      }
      const next = await gw.transition(sub.id, (s) => ({ ...s, status: s.status === 'pending' ? 'halted' : 'pending' }));
      await this.emit('payment.failed', { payment: p, subscription: next });
      await this.emit(next.status === 'halted' ? 'subscription.halted' : 'subscription.pending', { subscription: next });
      return { outcome: 'failure' as const, message: next.status === 'halted' ? 'Second failure: the subscription is now on hold (halted).' : 'Renewal payment failed: Razorpay would now retry (pending).' };
    }

    if (sub.status === 'created') {
      const deferred = !!sub.start_at && sub.start_at > nowS + 60;
      if (deferred) {
        // Mandate authorised with a token payment; the plan amount is charged when the trial ends.
        const authed = await gw.transition(sub.id, (s) => ({ ...s, status: 'authenticated' }));
        const p = payment('captured', 500);
        await this.emit('subscription.authenticated', { subscription: authed });
        return { outcome: 'success' as const, razorpay_payment_id: p.id, razorpay_subscription_id: sub.id, razorpay_signature: gw.signCheckout(p.id, sub.id) };
      }
      const start = nowS;
      const active = await gw.transition(sub.id, (s) => ({ ...s, status: 'active', current_start: start, current_end: addPeriod(start, plan.interval), paid_count: 1, customer_id: s.customer_id ?? gw.newPaymentId().replace('pay_', 'cust_') }));
      const p = payment('captured');
      await this.emit('subscription.authenticated', { subscription: { ...active, status: 'authenticated' } });
      await this.emit('subscription.activated', { subscription: active });
      await this.emit('subscription.charged', { subscription: active, payment: p });
      return { outcome: 'success' as const, razorpay_payment_id: p.id, razorpay_subscription_id: sub.id, razorpay_signature: gw.signCheckout(p.id, sub.id) };
    }

    // End of a period that was cancelled: Razorpay ends the subscription instead of charging.
    if (t.billing?.cancelAtPeriodEnd && sub.status === 'active') {
      const ended = await gw.transition(sub.id, (s) => ({ ...s, status: 'cancelled', ended_at: nowS }));
      await this.emit('subscription.cancelled', { subscription: ended });
      return { outcome: 'success' as const, message: 'The billing period ended and the subscription is now cancelled.' };
    }

    // Renewal (or a successful retry of a failed renewal), applying any scheduled downgrade.
    const scheduledPlanId = !Array.isArray(sub.notes) ? sub.notes.scheduled_plan_id : undefined;
    const renewed = await gw.transition(sub.id, (s) => {
      const start = s.status === 'authenticated' ? nowS : (s.current_end ?? nowS);
      const planId = scheduledPlanId || s.plan_id;
      return { ...s, plan_id: planId, has_scheduled_changes: false, status: 'active', current_start: start, current_end: addPeriod(start, plan.interval), paid_count: s.paid_count + 1, notes: { ...(s.notes as Record<string, string>), scheduled_plan_id: '' } };
    });
    const renewedPlan = (await this.planFor(renewed.plan_id)) ?? plan;
    await this.emit('subscription.charged', { subscription: renewed, payment: payment('captured', PLANS[renewedPlan.code].price[renewedPlan.interval]) });
    if (sub.status !== 'active') await this.emit('subscription.activated', { subscription: renewed });
    return { outcome: 'success' as const, message: 'Payment collected for the next billing period.' };
  }

  // ---- Platform operator ----------------------------------------------------------------------------

  async platformAction(a: AuthContext, tenantId: string, input: PlatformBillingInput, ip: string | null) {
    if (!isValidObjectId(tenantId)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Agency not found.' });
    const id = new Types.ObjectId(tenantId);
    const t = await this.tenantDoc(id);
    const b = billingOf(t);
    let summary: string;
    if (input.action === 'extend-trial') {
      const from = Math.max(Date.now(), b.trialEndsAt ? new Date(b.trialEndsAt).getTime() : 0);
      const until = new Date(from + input.days * 86_400_000);
      await this.setBilling(id, { trialEndsAt: until, 'notices.trialEnding': null });
      summary = `Trial extended by ${input.days} days (until ${until.toISOString().slice(0, 10)})`;
    } else if (input.action === 'grant') {
      const until = new Date(`${input.until}T23:59:59+05:30`);
      if (until.getTime() <= Date.now()) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Choose a date in the future.' });
      await this.setBilling(id, { compPlan: input.plan, compUntil: until });
      summary = `Complimentary ${PLANS[input.plan].name} plan granted until ${input.until}`;
    } else {
      await this.setBilling(id, { compPlan: null, compUntil: null });
      summary = 'Complimentary plan removed';
    }
    await this.audit.record({ tenantId: id, actor: { id: a.userId, name: `${a.name} (platform)` }, action: 'platform.billing', targetType: 'tenant', targetId: tenantId, summary, ip });
    return this.summary(id);
  }

  /** Billing columns for the platform agencies table. */
  async platformRows(ids: Types.ObjectId[]) {
    const ts = await this.tenants.find({ _id: { $in: ids } }, { billing: 1, createdAt: 1 }).lean<any[]>();
    // Newest captured payment per agency (plain query: works on every MongoDB-compatible engine).
    const recent = await this.payments.find({ status: 'captured', tenantId: { $in: ids } }, { tenantId: 1, amount: 1, paidAt: 1 }).sort({ paidAt: -1 }).limit(ids.length * 13).setOptions({ crossTenant: true }).lean<any[]>();
    const lastPaid: Array<{ _id: Types.ObjectId; amount: number; at: Date }> = [];
    for (const p of recent) if (!lastPaid.some((x) => String(x._id) === String(p.tenantId))) lastPaid.push({ _id: p.tenantId, amount: p.amount, at: p.paidAt });
    return new Map(ts.map((t) => {
      const b = billingOf(t);
      const acc = computeAccess(b);
      const lp = lastPaid.find((p) => String(p._id) === t._id.toString());
      return [t._id.toString(), {
        state: acc.state, plan: acc.plan, source: acc.source, endsAt: iso(acc.endsAt), status: b.status, interval: b.interval,
        compPlan: b.compPlan, compUntil: iso(b.compUntil), trialEndsAt: iso(b.trialEndsAt),
        nextPlan: acc.state === 'trial' && b.plan && (LIVE_STATUSES as readonly string[]).includes(b.status) ? b.plan : null, lastPayment: lp ? { amount: lp.amount, at: iso(lp.at) } : null,
      }];
    }));
  }

}
