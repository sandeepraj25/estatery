import type { INestApplication } from '@nestjs/common';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PLANS } from '@estatery/shared';
import { bootTestApp, signIn } from './helpers.js';

// These tests exercise DNS, TLS and routing with many domains on one agency; plan limits on
// custom domains are covered in billing.test.ts.
PLANS.signature.entitlements.customDomains = 50;

let app: INestApplication;
let conn: Connection;
let password: string;
let close: () => Promise<void>;
const A = 'aurelia.localhost';
const B = 'banyan.localhost';
const TOKEN = 'test-tls-ask-token-0123456789abcdef';

/** In-memory DNS + TLS, so verification is deterministic and offline. */
const zone = { txt: new Map<string, string[]>(), cname: new Map<string, string[]>(), a: new Map<string, string[]>() };
const tlsOk = new Set<string>();

beforeAll(async () => {
  ({ app, conn, password, close } = await bootTestApp('domains'));
  const { DnsService } = await import('../src/modules/domains/dns.service.js');
  app.get(DnsService).useFakes(
    {
      txt: async (n) => zone.txt.get(n) ?? [],
      cname: async (n) => zone.cname.get(n) ?? [],
      a: async (n) => zone.a.get(n) ?? [],
    },
    async (h) => (tlsOk.has(h) ? { ok: true, expiresAt: new Date(Date.now() + 80 * 86400_000), error: null } : { ok: false, expiresAt: null, error: 'certificate not yet issued' }),
  );
});
afterAll(async () => close?.());
beforeEach(() => {
  zone.txt.clear();
  zone.cname.clear();
  zone.a.clear();
  tlsOk.clear();
});

const owner = () => signIn(app, A, 'owner@aurelia.example', password);
const site = (host: string) => request(app.getHttpServer()).get('/v1/site').set('Host', host);

/** Publishes the DNS records the API asks for. */
function publishRecords(d: { hostname: string; records: Array<{ type: string; name: string; value: string }> }, opts: { txt?: boolean; route?: 'cname' | 'a' | 'wrong' } = {}) {
  const txt = d.records.find((r) => r.type === 'TXT')!;
  if (opts.txt !== false) zone.txt.set(txt.name, [txt.value]);
  if (opts.route === 'a') zone.a.set(d.hostname, ['203.0.113.10']);
  else if (opts.route === 'wrong') zone.cname.set(d.hostname, ['old-host.wix.com']);
  else zone.cname.set(d.hostname, ['sites.estatery.app.']);
}

describe('adding domains', () => {
  it('validates hostnames and normalises pasted URLs', async () => {
    const { c } = await owner();
    for (const bad of ['localhost', '192.168.1.10', '*.foo.com', 'no-dot', 'bad_chars.com', 'site.test']) {
      const r = await c.post('/v1/admin/domains', { hostname: bad });
      expect(r.status, bad).toBe(400);
    }
    const ok = await c.post('/v1/admin/domains', { hostname: 'https://WWW.Aurelia-Homes.in/some/page' });
    expect(ok.status).toBe(201);
    expect(ok.body.hostname).toBe('www.aurelia-homes.in');
    expect(ok.body.status).toBe('pending');
    expect(ok.body.records.map((r: { type: string }) => r.type)).toEqual(['TXT', 'CNAME']);
  });

  it('refuses platform hostnames', async () => {
    const { c } = await owner();
    expect((await c.post('/v1/admin/domains', { hostname: 'banyan.estatery.app' })).body.error.code).toBe('RESERVED_DOMAIN');
    expect((await c.post('/v1/admin/domains', { hostname: 'sites.estatery.app' })).status).toBe(400);
  });

  it('a domain claimed by one agency can’t be claimed by another, without revealing who', async () => {
    const { c } = await owner();
    await c.post('/v1/admin/domains', { hostname: 'claimed-by-aurelia.com' });
    const banyan = await signIn(app, B, 'owner@banyan.example', password);
    const r = await banyan.c.post('/v1/admin/domains', { hostname: 'claimed-by-aurelia.com' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('DOMAIN_TAKEN');
    expect(JSON.stringify(r.body)).not.toMatch(/aurelia/i);
  });

  it('a lapsed unverified claim is released to the real owner', async () => {
    const { c } = await owner();
    await c.post('/v1/admin/domains', { hostname: 'squatted.co.in' });
    await conn.collection('domains').updateOne({ hostname: 'squatted.co.in' }, { $set: { claimExpiresAt: new Date(Date.now() - 1000) } });
    const banyan = await signIn(app, B, 'owner@banyan.example', password);
    const r = await banyan.c.post('/v1/admin/domains', { hostname: 'squatted.co.in' });
    expect(r.status).toBe(201);
  });

  it('enforces the per-agency domain limit', async () => {
    const banyan = await conn.collection('tenants').findOne({ slug: 'banyan' });
    const existing = await conn.collection('domains').countDocuments({ tenantId: banyan!._id, kind: 'custom' });
    await conn.collection('domains').insertMany(
      Array.from({ length: 25 - existing }, (_, i) => ({ hostname: `filler-${i}.banyan-homes.in`, tenantId: banyan!._id, kind: 'custom', verified: false, status: 'pending', claimExpiresAt: new Date(Date.now() + 3600_000) })),
    );
    const { c } = await signIn(app, B, 'owner@banyan.example', password);
    const r = await c.post('/v1/admin/domains', { hostname: 'one-too-many.in' });
    expect(r.body.error.code).toBe('DOMAIN_LIMIT');
    await conn.collection('domains').deleteMany({ hostname: /^filler-/ });
  });

  it('only owners and admins can manage domains', async () => {
    for (const email of ['editor@aurelia.example', 'manager@aurelia.example', 'kabir@aurelia.example']) {
      const { c } = await signIn(app, A, email, password);
      expect((await c.get('/v1/admin/domains')).status, email).toBe(403);
    }
  });
});

describe('verification and routing', () => {
  it('an unverified domain never serves the site', async () => {
    const { c } = await owner();
    await c.post('/v1/admin/domains', { hostname: 'pending-only.in' });
    expect((await site('pending-only.in')).status).toBe(404);
  });

  it('needs both the TXT proof and correct routing; reports what is missing', async () => {
    const { c } = await owner();
    const d = (await c.post('/v1/admin/domains', { hostname: 'www.aurelia-estates.in' })).body;

    const none = await c.post(`/v1/admin/domains/${d.id}/verify`);
    expect(none.body.verified).toBe(false);
    expect(none.body.lastError).toMatch(/TXT record wasn’t found/);

    publishRecords(d, { route: 'wrong' });
    const wrong = await c.post(`/v1/admin/domains/${d.id}/verify`);
    expect(wrong.body.verified).toBe(false);
    expect(wrong.body.routing.detail).toMatch(/old-host\.wix\.com/);
    expect((await site('www.aurelia-estates.in')).status).toBe(404);

    publishRecords(d);
    const ok = await c.post(`/v1/admin/domains/${d.id}/verify`);
    expect(ok.body.verified).toBe(true);
    expect(ok.body.status).toBe('verified');
    expect(ok.body.tls.status).toBe('pending');
    const live = await site('www.aurelia-estates.in');
    expect(live.status).toBe(200);
    expect(live.body.tenant.slug).toBe('aurelia');
  });

  it('a TXT record for a different token does not verify (no copying another claim)', async () => {
    const { c } = await owner();
    const d = (await c.post('/v1/admin/domains', { hostname: 'copy-attempt.in' })).body;
    zone.txt.set(`_estatery-verify.copy-attempt.in`, ['estatery-verify=0000000000000000']);
    zone.cname.set('copy-attempt.in', ['sites.estatery.app']);
    const r = await c.post(`/v1/admin/domains/${d.id}/verify`);
    expect(r.body.verified).toBe(false);
    expect(r.body.lastError).toMatch(/different value/);
  });

  it('apex domains can verify with A records', async () => {
    const { c } = await owner();
    const d = (await c.post('/v1/admin/domains', { hostname: 'aurelia-apex.in' })).body;
    expect(d.records.map((r: { type: string }) => r.type)).toEqual(['TXT', 'A']);
    publishRecords(d, { route: 'a' });
    expect((await c.post(`/v1/admin/domains/${d.id}/verify`)).body.verified).toBe(true);
  });

  it('cannot verify, set primary or remove another agency’s domain', async () => {
    const { c } = await owner();
    const d = (await c.post('/v1/admin/domains', { hostname: 'aurelia-private.in' })).body;
    const banyan = await signIn(app, B, 'owner@banyan.example', password);
    expect((await banyan.c.post(`/v1/admin/domains/${d.id}/verify`)).status).toBe(404);
    expect((await banyan.c.post(`/v1/admin/domains/${d.id}/primary`)).status).toBe(404);
    expect((await banyan.c.del(`/v1/admin/domains/${d.id}`)).status).toBe(404);
  });
});

describe('primary domain, HTTPS and redirects', () => {
  it('primary requires verification and active HTTPS; then other addresses redirect and canonical URLs switch', async () => {
    const { c } = await owner();
    const d = (await c.post('/v1/admin/domains', { hostname: 'www.aurelia-main.in' })).body;
    expect((await c.post(`/v1/admin/domains/${d.id}/primary`)).body.error.code).toBe('NOT_VERIFIED');
    publishRecords(d);
    await c.post(`/v1/admin/domains/${d.id}/verify`);
    expect((await c.post(`/v1/admin/domains/${d.id}/primary`)).body.error.code).toBe('TLS_PENDING');

    tlsOk.add('www.aurelia-main.in');
    expect((await c.post(`/v1/admin/domains/${d.id}/verify`)).body.tls.status).toBe('active');
    expect((await c.post(`/v1/admin/domains/${d.id}/primary`)).status).toBe(200);

    const fromPlatform = await request(app.getHttpServer()).get('/v1/site/routing').set('Host', A);
    expect(fromPlatform.body).toMatchObject({ primaryHost: 'www.aurelia-main.in', redirectTo: 'www.aurelia-main.in' });
    const onPrimary = await request(app.getHttpServer()).get('/v1/site/routing').set('Host', 'www.aurelia-main.in');
    expect(onPrimary.body.redirectTo).toBeNull();
    expect((await site(A)).body.canonicalHost).toBe('www.aurelia-main.in');
    // Banyan is untouched.
    expect((await request(app.getHttpServer()).get('/v1/site/routing').set('Host', B)).body.redirectTo).toBeNull();
  });

  it('removing the primary falls back to the platform address; the platform address can’t be removed', async () => {
    const { c } = await owner();
    const list = (await c.get('/v1/admin/domains')).body.items;
    const primary = list.find((x: { isPrimary: boolean }) => x.isPrimary);
    expect(primary.hostname).toBe('www.aurelia-main.in');
    expect((await c.del(`/v1/admin/domains/${primary.id}`)).status).toBe(204);
    const after = (await c.get('/v1/admin/domains')).body.items;
    expect(after.find((x: { isPrimary: boolean }) => x.isPrimary).kind).toBe('platform');
    const platform = after.find((x: { kind: string }) => x.kind === 'platform');
    expect((await c.del(`/v1/admin/domains/${platform.id}`)).body.error.code).toBe('PLATFORM_DOMAIN');
    expect((await site('www.aurelia-main.in')).status).toBe(404);
  });
});

describe('TLS ask endpoint (Caddy on-demand certificates)', () => {
  const ask = (domain: string, token = TOKEN) => request(app.getHttpServer()).get(`/internal/tls/ask?token=${token}&domain=${domain}`);

  it('approves only verified domains of active agencies, with the right token', async () => {
    const { c } = await owner();
    const d = (await c.post('/v1/admin/domains', { hostname: 'tls-check.in' })).body;
    expect((await ask('tls-check.in')).status).toBe(404); // not verified
    publishRecords(d);
    await c.post(`/v1/admin/domains/${d.id}/verify`);
    expect((await ask('tls-check.in')).status).toBe(200);
    expect((await ask('tls-check.in', 'wrong-token-wrong-token-wrong-token')).status).toBe(404);
    expect((await ask('random-unknown.com')).status).toBe(404);

    const aurelia = await conn.collection('tenants').findOne({ slug: 'aurelia' });
    await conn.collection('tenants').updateOne({ _id: aurelia!._id }, { $set: { status: 'suspended' } });
    expect((await ask('tls-check.in')).status).toBe(404);
    await conn.collection('tenants').updateOne({ _id: aurelia!._id }, { $set: { status: 'active' } });
  });
});

describe('scheduled re-checks', () => {
  it('a domain whose DNS is removed stops routing after repeated failures, and owners are told', async () => {
    const { c } = await owner();
    const d = (await c.post('/v1/admin/domains', { hostname: 'moving-away.in' })).body;
    publishRecords(d);
    tlsOk.add('moving-away.in');
    await c.post(`/v1/admin/domains/${d.id}/verify`);
    expect((await site('moving-away.in')).status).toBe(200);

    const { DomainRecheckService } = await import('../src/modules/domains/domain-recheck.service.js');
    const job = app.get(DomainRecheckService);
    zone.txt.clear();
    zone.cname.clear(); // DNS moved to another provider
    for (let i = 0; i < 3; i++) {
      await conn.collection('domains').updateMany({ verified: true, kind: 'custom' }, { $set: { lastCheckedAt: new Date(0) } });
      await job.tick();
    }
    const row = await conn.collection('domains').findOne({ hostname: 'moving-away.in' });
    expect(row?.status).toBe('lost');
    expect(row?.verified).toBe(false);
    expect((await site('moving-away.in')).status).toBe(404);
    const { MailService } = await import('../src/modules/mail/mail.service.js');
    expect(app.get(MailService).outbox.some((m) => m.subject.includes('moving-away.in'))).toBe(true);
  });

  it('releases lapsed unverified claims', async () => {
    const { c } = await owner();
    await c.post('/v1/admin/domains', { hostname: 'never-verified.in' });
    await conn.collection('domains').updateOne({ hostname: 'never-verified.in' }, { $set: { claimExpiresAt: new Date(Date.now() - 1000) } });
    const { DomainRecheckService } = await import('../src/modules/domains/domain-recheck.service.js');
    const r = await app.get(DomainRecheckService).tick();
    expect(r.released).toBeGreaterThanOrEqual(1);
    expect(await conn.collection('domains').countDocuments({ hostname: 'never-verified.in' })).toBe(0);
  });
});
