import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootTestApp } from './helpers.js';

let app: INestApplication;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ app, close } = await bootTestApp('hardening'));
});
afterAll(async () => close?.());

describe('operations', () => {
  it('reports liveness and readiness', async () => {
    expect((await request(app.getHttpServer()).get('/health')).body).toMatchObject({ ok: true, version: expect.any(String) });
    const ready = await request(app.getHttpServer()).get('/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({ ok: true, database: true, jobs: 'inline' });
  });

  it('gives every response a request id, keeping a valid one from the web server', async () => {
    const generated = await request(app.getHttpServer()).get('/v1/site').set('Host', 'aurelia.localhost');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const kept = await request(app.getHttpServer()).get('/v1/site').set('Host', 'aurelia.localhost').set('x-request-id', 'trace-1234abcd');
    expect(kept.headers['x-request-id']).toBe('trace-1234abcd');
    const junk = await request(app.getHttpServer()).get('/v1/site').set('Host', 'aurelia.localhost').set('x-request-id', '<script>');
    expect(junk.headers['x-request-id']).not.toBe('<script>');
  });

  it('errors from file downloads still come back as JSON', async () => {
    const res = await request(app.getHttpServer()).get('/v1/admin/leads/export.csv').set('Host', 'aurelia.localhost');
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['content-disposition']).toBeUndefined();
  });
});

describe('creating an agency (platform operator)', () => {
  it('creates a working site on a platform subdomain and invites its owner', async () => {
    const { signIn, Jar, client } = await import('./helpers.js');
    const { SEED_PASSWORD } = await import('../src/scripts/seed.js');
    const { MailService } = await import('../src/modules/mail/mail.service.js');
    const platform = await signIn(app, 'aurelia.localhost', 'platform@estatery.example', SEED_PASSWORD);
    const body = { name: 'Coastline Homes', slug: 'coastline', ownerName: 'Meera Nair', ownerEmail: 'meera@coastline.example', themePreset: 'midnight-terracotta' };

    const owner = await signIn(app, 'aurelia.localhost', 'owner@aurelia.example', SEED_PASSWORD);
    expect((await owner.c.post('/v1/platform/tenants', body)).status).toBe(403);
    expect((await platform.c.post('/v1/platform/tenants', { ...body, slug: 'admin' })).status).toBe(400);

    const created = await platform.c.post('/v1/platform/tenants', body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ slug: 'coastline', hostname: 'coastline.estatery.app' });
    expect((await platform.c.post('/v1/platform/tenants', body)).status).toBe(409);

    const host = 'coastline.estatery.app';
    const site = await request(app.getHttpServer()).get('/v1/site').set('Host', host);
    expect(site.status).toBe(200);
    expect(site.body.settings.businessName).toBe('Coastline Homes');
    expect(site.body.pages.about).toBe(true);
    expect((await request(app.getHttpServer()).get('/v1/site/home').set('Host', host)).status).toBe(200);

    const mail = app.get(MailService).outbox.find((m) => m.to === 'meera@coastline.example');
    expect(mail?.subject).toContain('Coastline Homes');
    const token = /token=([A-Za-z0-9_-]+)/.exec(mail!.text)![1]!;
    const jar = new Jar(host);
    const c = client(app, jar);
    await c.get('/v1/auth/csrf');
    const accepted = await c.post('/v1/auth/accept-invite', { token, name: 'Meera Nair', password: 'Coastline-2026-ok' });
    expect(accepted.status).toBeLessThan(300);
    const me = (await c.get('/v1/auth/me')).body;
    expect(me).toMatchObject({ role: 'owner', tenant: { name: 'Coastline Homes' } });
    expect((await c.get('/v1/admin/billing/summary')).body).toMatchObject({ state: 'trial', plan: 'professional' });
  });
});
