import type { INestApplication } from '@nestjs/common';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeAccess, initialBilling, PLANS, type BillingState } from '@estatery/shared';
import { bootTestApp, KEY, signIn } from './helpers.js';

let app: INestApplication;
let conn: Connection;
let password: string;
let close: () => Promise<void>;
let ids: { aurelia: { toString(): string }; banyan: { toString(): string } };
let webhookSecret: string;
let hmac: (secret: string, data: string) => string;
let mailbox: () => Array<{ to: string; subject: string; text: string }>;
let drain: () => Promise<void>;
const A = 'aurelia.localhost';
const B = 'banyan.localhost';
const DAY = 86_400_000;

beforeAll(async () => {
  ({ app, conn, password, close, ids } = await bootTestApp('billing'));
  const gw = await import('../src/modules/billing/razorpay.gateway.js');
  const { MailService } = await import('../src/modules/mail/mail.service.js');
  const { QueueService } = await import('../src/modules/jobs/queue.service.js');
  hmac = gw.hmacHex;
  webhookSecret = gw.hmacHex(KEY, 'billing-simulator-webhook');
  mailbox = () => app.get(MailService).outbox;
  drain = () => app.get(QueueService).drain();
});
afterAll(async () => close?.());

const tenant = async (slug: string) => (await conn.collection('tenants').findOne({ slug }))!;
const sendWebhook = (raw: string, opts: { sig?: string | null; key?: string | null; eventId?: string } = {}) => {
  let r = request(app.getHttpServer()).post('/internal/billing/razorpay-webhook').set('content-type', 'application/json');
  if (opts.key !== null) r = r.set('x-internal-key', opts.key ?? KEY);
  if (opts.sig !== null) r = r.set('x-razorpay-signature', opts.sig ?? hmac(webhookSecret, raw));
  if (opts.eventId) r = r.set('x-razorpay-event-id', opts.eventId);
  return r.send(raw);
};
const subEvent = (event: string, sub: Record<string, unknown>, createdAt: number, payment?: Record<string, unknown>) =>
  JSON.stringify({ entity: 'event', account_id: 'acc_test', event, contains: payment ? ['subscription', 'payment'] : ['subscription'], created_at: createdAt, payload: { subscription: { entity: sub }, ...(payment ? { payment: { entity: payment } } : {}) } });

describe('access rules (computeAccess)', () => {
  const now = new Date('2026-10-21T00:00:00Z');
  const base = (over: Partial<BillingState>): BillingState => ({ ...initialBilling(new Date(now.getTime() - 5 * DAY)), ...over });

  it('a new agency is on the Professional trial, then restricted when it ends', () => {
    const b = base({});
    expect(computeAccess(b, now)).toMatchObject({ state: 'trial', plan: 'professional', source: 'trial' });
    expect(computeAccess(b, new Date(now.getTime() + 10 * DAY))).toMatchObject({ state: 'restricted', plan: null });
    expect(computeAccess(b, new Date(now.getTime() + 10 * DAY)).entitlements.listings).toBe(0);
  });

  it('a subscription set up during the trial keeps the trial until it ends, then the chosen plan applies', () => {
    const b = base({ plan: 'essential', interval: 'monthly', status: 'authenticated' });
    expect(computeAccess(b, now)).toMatchObject({ state: 'trial', plan: 'professional' });
    expect(computeAccess(b, new Date(now.getTime() + 10 * DAY))).toMatchObject({ state: 'active', plan: 'essential' });
  });

  it('failed renewals keep full access (pending), then a 7-day grace once halted', () => {
    const paid = { plan: 'signature' as const, interval: 'monthly' as const, trialEndsAt: new Date(now.getTime() - 60 * DAY), paidThrough: new Date(now.getTime() - DAY) };
    expect(computeAccess(base({ ...paid, status: 'pending' }), now).state).toBe('past_due');
    expect(computeAccess(base({ ...paid, status: 'halted', haltedAt: new Date(now.getTime() - 3 * DAY) }), now)).toMatchObject({ state: 'grace', plan: 'signature' });
    expect(computeAccess(base({ ...paid, status: 'halted', haltedAt: new Date(now.getTime() - 8 * DAY) }), now).state).toBe('restricted');
  });

  it('a cancelled subscription lasts until the end of the paid period', () => {
    const b = base({ plan: 'signature', interval: 'monthly', status: 'cancelled', trialEndsAt: new Date(now.getTime() - 60 * DAY), paidThrough: new Date(now.getTime() + 4 * DAY) });
    expect(computeAccess(b, now)).toMatchObject({ state: 'active', plan: 'signature' });
    expect(computeAccess(b, new Date(now.getTime() + 5 * DAY)).state).toBe('restricted');
  });

  it('a complimentary plan from the platform wins over everything until it expires', () => {
    const b = base({ trialEndsAt: new Date(now.getTime() - DAY), compPlan: 'signature', compUntil: new Date(now.getTime() + 30 * DAY) });
    expect(computeAccess(b, now)).toMatchObject({ state: 'active', plan: 'signature', source: 'complimentary' });
  });
});

describe('billing page access', () => {
  it('only the owner sees billing; every member can read the summary', async () => {
    const owner = await signIn(app, A, 'owner@aurelia.example', password);
    const res = await owner.c.get('/v1/admin/billing');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mode: 'test', access: { state: 'active', plan: 'signature', source: 'subscription' }, billing: { interval: 'monthly' } });
    expect(res.body.usage.listings).toBeGreaterThan(0);
    expect(res.body.payments).toHaveLength(3);

    const admin = await signIn(app, A, 'admin@aurelia.example', password);
    expect((await admin.c.get('/v1/admin/billing')).status).toBe(403);
    expect((await admin.c.post('/v1/admin/billing/checkout', { plan: 'essential', interval: 'monthly' })).status).toBe(403);
    const agent = await signIn(app, A, 'kabir@aurelia.example', password);
    expect((await agent.c.get('/v1/admin/billing/summary')).body).toMatchObject({ state: 'active', plan: 'signature' });
  });
});

describe('webhooks', () => {
  it('reject requests without the internal key or with a bad signature', async () => {
    const raw = subEvent('subscription.activated', { id: 'sub_x' }, 1);
    expect((await sendWebhook(raw, { key: null })).status).toBe(404);
    expect((await sendWebhook(raw, { sig: null })).status).toBe(400);
    expect((await sendWebhook(raw, { sig: 'a'.repeat(64) })).status).toBe(400);
    // Signature over different bytes (e.g. re-serialised JSON) must fail too.
    expect((await sendWebhook(raw, { sig: hmac(webhookSecret, raw.replace('"entity":"event"', '"entity": "event"')) })).status).toBe(400);
  });

  it('are idempotent: a replayed event is acknowledged but not applied twice', async () => {
    const t = await tenant('aurelia');
    const sub = { id: t.billing.subscriptionId, plan_id: 'plan_simsignaturemonthly', status: 'active', current_start: 1_800_000_000, current_end: 1_802_678_400, customer_id: 'cust_simAurelia01', notes: { tenantId: t._id.toString() } };
    const pay = { id: 'pay_replayTest001', amount: PLANS.signature.price.monthly, currency: 'INR', status: 'captured', method: 'card', invoice_id: null, created_at: 1_800_000_000 };
    const raw = subEvent('subscription.charged', sub, Math.floor(Date.now() / 1000) - 100, pay);
    const before = mailbox().length;
    const first = await sendWebhook(raw, { eventId: 'evt_replay_1' });
    expect(first.body).toMatchObject({ status: 'processed' });
    const second = await sendWebhook(raw, { eventId: 'evt_replay_1' });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ status: 'duplicate' });
    await drain();
    expect(await conn.collection('billingpayments').countDocuments({ paymentId: 'pay_replayTest001' })).toBe(1);
    expect(mailbox().slice(before).filter((m) => m.subject.startsWith('Payment received'))).toHaveLength(1);
    expect((await tenant('aurelia')).billing.paidThrough.toISOString()).toBe(new Date(1_802_678_400_000).toISOString());
  });

  it('never let an older event roll state back', async () => {
    const t = await tenant('aurelia');
    const sub = { id: t.billing.subscriptionId, plan_id: 'plan_simsignaturemonthly', current_start: 1_800_000_000, current_end: 1_802_678_400, customer_id: null, notes: {} };
    const now = Math.floor(Date.now() / 1000);
    await sendWebhook(subEvent('subscription.pending', { ...sub, status: 'pending' }, now - 20), { eventId: 'evt_order_new' });
    await sendWebhook(subEvent('subscription.activated', { ...sub, status: 'active' }, now - 40), { eventId: 'evt_order_old' });
    expect((await tenant('aurelia')).billing.status).toBe('pending');
    await sendWebhook(subEvent('subscription.charged', { ...sub, status: 'active' }, now - 10), { eventId: 'evt_order_newest' });
    expect((await tenant('aurelia')).billing.status).toBe('active');
  });

  it('ignore subscriptions that belong to nobody', async () => {
    const res = await sendWebhook(subEvent('subscription.activated', { id: 'sub_unknown12345', plan_id: 'plan_x', status: 'active', notes: {} }, 1), { eventId: 'evt_unknown' });
    expect(res.body).toMatchObject({ status: 'ignored' });
  });
});

describe('subscribing during the trial (Banyan)', () => {
  let subscriptionId: string;

  it('checkout defers the first charge to the end of the trial', async () => {
    const owner = await signIn(app, B, 'owner@banyan.example', password);
    expect((await owner.c.get('/v1/admin/billing/summary')).body).toMatchObject({ state: 'trial', plan: 'professional' });
    const res = await owner.c.post('/v1/admin/billing/checkout', { plan: 'essential', interval: 'monthly' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mode: 'test', plan: 'essential', amount: PLANS.essential.price.monthly });
    expect(res.body.subscriptionId).toMatch(/^sub_/);
    expect(new Date(res.body.firstChargeAt).getTime()).toBeGreaterThan(Date.now() + 2 * DAY);
    subscriptionId = res.body.subscriptionId;
    // Abandoned checkout changes nothing.
    expect((await owner.c.get('/v1/admin/billing/summary')).body.plan).toBe('professional');
  });

  it('a declined payment leaves the trial untouched', async () => {
    const owner = await signIn(app, B, 'owner@banyan.example', password);
    const res = await owner.c.post('/v1/admin/billing/simulate', { subscriptionId, outcome: 'failure' });
    expect(res.body.outcome).toBe('failure');
    expect((await owner.c.get('/v1/admin/billing/summary')).body).toMatchObject({ state: 'trial' });
  });

  it('a successful payment is verified by signature and switches to the chosen plan', async () => {
    const owner = await signIn(app, B, 'owner@banyan.example', password);
    const paid = (await owner.c.post('/v1/admin/billing/simulate', { subscriptionId, outcome: 'success' })).body;
    expect(paid.razorpay_signature).toMatch(/^[a-f0-9]{64}$/);
    const forged = await owner.c.post('/v1/admin/billing/verify', { ...paid, outcome: undefined, razorpay_signature: 'f'.repeat(64) });
    expect(forged.status).toBe(400);
    const ok = await owner.c.post('/v1/admin/billing/verify', { razorpay_payment_id: paid.razorpay_payment_id, razorpay_subscription_id: paid.razorpay_subscription_id, razorpay_signature: paid.razorpay_signature });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ state: 'trial', plan: 'professional', subscribed: true });
    const t = await tenant('banyan');
    expect(t.billing).toMatchObject({ status: 'authenticated', subscriptionId, plan: 'essential' });
    expect(t.billing.checkout.subscriptionId).toBeNull();
    expect(await conn.collection('auditlogs').countDocuments({ tenantId: t._id, action: 'billing.subscribed' })).toBe(1);
    // A second checkout isn't allowed while subscribed.
    expect((await owner.c.post('/v1/admin/billing/checkout', { plan: 'signature', interval: 'yearly' })).status).toBe(409);
  });

  it('another agency can’t drive Banyan’s subscription', async () => {
    const aurelia = await signIn(app, A, 'owner@aurelia.example', password);
    expect((await aurelia.c.post('/v1/admin/billing/simulate', { subscriptionId, outcome: 'success' })).status).toBe(403);
  });
});

describe('plan limits (Banyan on Essential)', () => {
  it('limits team seats, custom domains and premium features; the site shows platform branding', async () => {
    // The trial is over, so Essential's limits now apply.
    await conn.collection('tenants').updateOne({ slug: 'banyan' }, { $set: { 'billing.trialEndsAt': new Date(Date.now() - 60_000) } });
    const owner = await signIn(app, B, 'owner@banyan.example', password);
    expect((await owner.c.get('/v1/admin/billing/summary')).body).toMatchObject({ state: 'active', plan: 'essential' });
    expect((await owner.c.post('/v1/admin/team/invites', { email: 'one@banyan.example', role: 'agent' })).status).toBe(201);
    expect((await owner.c.post('/v1/admin/team/invites', { email: 'two@banyan.example', role: 'agent' })).status).toBe(201);
    const third = await owner.c.post('/v1/admin/team/invites', { email: 'three@banyan.example', role: 'agent' });
    expect(third.status).toBe(403);
    expect(third.body.error).toMatchObject({ code: 'PLAN_LIMIT' });
    expect(third.body.error.message).toContain('Essential plan includes 3 team members');
    // Re-sending an existing invitation doesn't need another seat.
    expect((await owner.c.post('/v1/admin/team/invites', { email: 'two@banyan.example', role: 'agent' })).status).toBe(201);

    expect((await owner.c.post('/v1/admin/domains', { hostname: 'www.banyan-realty.in' })).status).toBe(201);
    const domain2 = await owner.c.post('/v1/admin/domains', { hostname: 'banyan-homes.in' });
    expect(domain2.status).toBe(403);
    expect(domain2.body.error.code).toBe('PLAN_LIMIT');

    const exp = await owner.c.get('/v1/admin/leads/export.csv');
    expect(exp.status).toBe(403);
    expect(exp.body.error.code).toBe('PLAN_FEATURE');
    expect((await owner.c.put('/v1/admin/crm/settings', { notifyEmails: [], notifyAssignedAgent: true, roundRobin: true })).body.error.code).toBe('PLAN_FEATURE');

    await conn.collection('tenants').updateOne({ slug: 'banyan' }, { $set: { 'settings.showPlatformBranding': false } });
    const site = await request(app.getHttpServer()).get('/v1/site').set('Host', B);
    expect(site.body.settings.showPlatformBranding).toBe(true);
    const aurelia = await request(app.getHttpServer()).get('/v1/site').set('Host', A);
    await conn.collection('tenants').updateOne({ slug: 'aurelia' }, { $set: { 'settings.showPlatformBranding': false } });
    void aurelia;
    expect((await request(app.getHttpServer()).get('/v1/site').set('Host', A)).body.settings.showPlatformBranding).toBe(false);
  });
});

describe('changing plans (Aurelia, paying monthly for Signature)', () => {
  it('a downgrade is scheduled for the next billing date and applied on renewal', async () => {
    const owner = await signIn(app, A, 'owner@aurelia.example', password);
    const res = await owner.c.post('/v1/admin/billing/change', { plan: 'professional', interval: 'monthly' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ scheduled: true });
    let t = await tenant('aurelia');
    expect(t.billing).toMatchObject({ plan: 'signature', scheduledPlan: 'professional' });
    const renew = await owner.c.post('/v1/admin/billing/simulate', { subscriptionId: t.billing.subscriptionId, outcome: 'success' });
    expect(renew.body.outcome).toBe('success');
    t = await tenant('aurelia');
    expect(t.billing).toMatchObject({ plan: 'professional', interval: 'monthly', status: 'active', scheduledPlan: null });
  });

  it('an upgrade applies immediately', async () => {
    const owner = await signIn(app, A, 'owner@aurelia.example', password);
    const res = await owner.c.post('/v1/admin/billing/change', { plan: 'signature', interval: 'yearly' });
    expect(res.body).toMatchObject({ scheduled: false, summary: { plan: 'signature' } });
    expect((await tenant('aurelia')).billing).toMatchObject({ plan: 'signature', interval: 'yearly' });
    expect((await owner.c.post('/v1/admin/billing/change', { plan: 'signature', interval: 'yearly' })).body.error.code).toBe('SAME_PLAN');
  });
});

describe('failed payments (dunning)', () => {
  it('first failure: past due with an email; second: on hold with a 7-day grace; then restricted but online', async () => {
    const owner = await signIn(app, A, 'owner@aurelia.example', password);
    const subId = (await tenant('aurelia')).billing.subscriptionId;
    const before = mailbox().length;
    await owner.c.post('/v1/admin/billing/simulate', { subscriptionId: subId, outcome: 'failure' });
    expect((await owner.c.get('/v1/admin/billing/summary')).body.state).toBe('past_due');
    await owner.c.post('/v1/admin/billing/simulate', { subscriptionId: subId, outcome: 'failure' });
    expect((await owner.c.get('/v1/admin/billing/summary')).body.state).toBe('grace');
    await drain();
    const subjects = mailbox().slice(before).map((m) => m.subject);
    expect(subjects).toEqual(expect.arrayContaining([expect.stringContaining('Payment failed'), expect.stringContaining('on hold')]));
    expect(await conn.collection('billingpayments').countDocuments({ tenantId: (await tenant('aurelia'))._id, status: 'failed' })).toBe(2);
    // Changing plans isn't possible while a payment is due.
    expect((await owner.c.post('/v1/admin/billing/change', { plan: 'essential', interval: 'monthly' })).body.error.code).toBe('PAYMENT_DUE');

    // Eight days later, with the paid period over:
    await conn.collection('tenants').updateOne({ slug: 'aurelia' }, { $set: { 'billing.haltedAt': new Date(Date.now() - 8 * DAY), 'billing.paidThrough': new Date(Date.now() - DAY) } });
    expect((await owner.c.get('/v1/admin/billing/summary')).body.state).toBe('restricted');
    const live = await conn.collection('properties').findOne({ tenantId: (await tenant('aurelia'))._id, status: 'published' });
    expect((await owner.c.post(`/v1/admin/properties/${live!._id}/status`, { status: 'draft' })).status).toBeLessThan(300);
    const republish = await owner.c.post(`/v1/admin/properties/${live!._id}/status`, { status: 'published' });
    expect(republish.status).toBe(403);
    expect(republish.body.error.code).toBe('PLAN_INACTIVE');
    expect((await request(app.getHttpServer()).get('/v1/site').set('Host', A)).status).toBe(200);

    // Paying again restores everything.
    await owner.c.post('/v1/admin/billing/simulate', { subscriptionId: subId, outcome: 'success' });
    expect((await owner.c.get('/v1/admin/billing/summary')).body.state).toBe('active');
    expect((await owner.c.post(`/v1/admin/properties/${live!._id}/status`, { status: 'published' })).status).toBeLessThan(300);
  });
});

describe('cancelling', () => {
  it('cancels at the end of the paid period; access continues until then', async () => {
    const owner = await signIn(app, A, 'owner@aurelia.example', password);
    const res = await owner.c.post('/v1/admin/billing/cancel', { reason: 'Moving to an in-house site' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ state: 'active', cancelAtPeriodEnd: true });
    const t = await tenant('aurelia');
    await owner.c.post('/v1/admin/billing/simulate', { subscriptionId: t.billing.subscriptionId, outcome: 'success' });
    const after = await tenant('aurelia');
    expect(after.billing).toMatchObject({ status: 'cancelled', cancelAtPeriodEnd: false });
    expect((await owner.c.get('/v1/admin/billing/summary')).body).toMatchObject({ state: 'active', plan: 'signature' }); // paid period still running
    // A new checkout is allowed once the subscription has ended.
    expect((await owner.c.post('/v1/admin/billing/checkout', { plan: 'professional', interval: 'monthly' })).status).toBe(200);
  });
});

describe('platform operator', () => {
  it('extends trials and grants complimentary plans; agencies can’t', async () => {
    const platform = await signIn(app, A, 'platform@estatery.example', password);
    const banyanId = ids.banyan.toString();
    const grant = await platform.c.patch(`/v1/platform/tenants/${banyanId}/billing`, { action: 'grant', plan: 'signature', until: '2099-12-31' });
    expect(grant.status).toBe(200);
    expect(grant.body).toMatchObject({ state: 'active', plan: 'signature', source: 'complimentary' });
    expect((await platform.c.patch(`/v1/platform/tenants/${banyanId}/billing`, { action: 'revoke-grant' })).body.source).not.toBe('complimentary');
    const ext = await platform.c.patch(`/v1/platform/tenants/${banyanId}/billing`, { action: 'extend-trial', days: 14 });
    expect(ext.status).toBe(200);
    expect(new Date((await tenant('banyan')).billing.trialEndsAt).getTime()).toBeGreaterThan(Date.now() + 13 * DAY);

    const owner = await signIn(app, B, 'owner@banyan.example', password);
    expect((await owner.c.patch(`/v1/platform/tenants/${banyanId}/billing`, { action: 'grant', plan: 'signature', until: '2099-12-31' })).status).toBe(403);
  });
});

describe('trial reminders', () => {
  it('emails the owner once when the trial ends within 3 days', async () => {
    const { BillingService } = await import('../src/modules/billing/billing.service.js');
    const svc = app.get(BillingService);
    await conn.collection('tenants').updateOne({ slug: 'banyan' }, { $set: { billing: null, createdAt: new Date(Date.now() - 12 * DAY) } });
    const before = mailbox().length;
    expect(await svc.sendNotices()).toBeGreaterThanOrEqual(1);
    expect(await svc.sendNotices()).toBe(0);
    await drain();
    const sent = mailbox().slice(before).filter((m) => m.subject.startsWith('Your free trial ends'));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('owner@banyan.example');
  });
});
