import type { INestApplication } from '@nestjs/common';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootTestApp, client, Jar, signIn } from './helpers.js';

let app: INestApplication;
let conn: Connection;
let password: string;
let close: () => Promise<void>;
const A = 'aurelia.localhost';
const B = 'banyan.localhost';

beforeAll(async () => {
  ({ app, conn, password, close } = await bootTestApp('auth'));
});
afterAll(async () => close?.());

const mail = async () => (app.get((await import('../src/modules/mail/mail.service.js')).MailService)).outbox;

describe('sign-in', () => {
  it('rejects login without a CSRF token', async () => {
    const jar = new Jar(A);
    const res = await client(app, jar).post('/v1/auth/login', { email: 'owner@aurelia.example', password }, false);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_FAILED');
  });

  it('signs in and sets HttpOnly session cookies', async () => {
    const { res, c } = await signIn(app, A, 'owner@aurelia.example', password);
    expect(res.status).toBe(200);
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join('\n');
    expect(cookies).toMatch(/es_at=[^;]+;.*HttpOnly/);
    expect(cookies).toMatch(/es_rt=[^;]+;.*HttpOnly.*SameSite=Strict/);
    const me = await c.get('/v1/auth/me');
    expect(me.body.role).toBe('owner');
    expect(me.body.tenant.slug).toBe('aurelia');
  });

  it('gives the same error for an unknown email and a wrong password', async () => {
    const a = await signIn(app, A, 'nobody@example.com', password);
    const b = await signIn(app, A, 'admin@aurelia.example', 'wrong-password-1');
    expect(a.res.status).toBe(401);
    expect(b.res.status).toBe(401);
    expect(a.res.body.error.message).toBe(b.res.body.error.message);
  });

  it('refuses a valid user on an agency they don’t belong to', async () => {
    const { res } = await signIn(app, B, 'owner@aurelia.example', password);
    expect(res.status).toBe(401);
  });

  it('locks the account after repeated failures (LOGIN_MAX_ATTEMPTS=3 in tests)', async () => {
    for (let i = 0; i < 3; i++) await signIn(app, A, 'support@aurelia.example', 'wrong-password-1');
    const locked = await signIn(app, A, 'support@aurelia.example', password);
    expect(locked.res.status).toBe(429);
    expect(locked.res.body.error.code).toBe('ACCOUNT_LOCKED');
    await conn.collection('users').updateOne({ email: 'support@aurelia.example' }, { $set: { lockedUntil: null, failedLogins: 0 } });
  });

  it('rejects requests without a session', async () => {
    const res = await request(app.getHttpServer()).get('/v1/admin/dashboard').set('Host', A);
    expect(res.status).toBe(401);
  });

  it('rejects a forged or tampered access token', async () => {
    const { jar, c } = await signIn(app, A, 'owner@aurelia.example', password);
    const token = jar.get('es_at')!;
    jar.set('es_at', token.slice(0, -4) + 'AAAA');
    expect((await c.get('/v1/auth/me')).status).toBe(401);
  });
});

describe('cross-tenant sessions', () => {
  it('a token issued on one agency is rejected on another', async () => {
    const { jar } = await signIn(app, A, 'owner@aurelia.example', password);
    const stolen = new Jar(B);
    stolen.set('es_at', jar.get('es_at')!);
    const res = await client(app, stolen).get('/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/different site/);
  });
});

describe('refresh tokens', () => {
  it('rotates the refresh token', async () => {
    const { jar, c } = await signIn(app, A, 'admin@aurelia.example', password);
    const first = jar.get('es_rt');
    const res = await c.post('/v1/auth/refresh');
    expect(res.status).toBe(200);
    expect(jar.get('es_rt')).not.toBe(first);
    expect((await c.get('/v1/auth/me')).status).toBe(200);
  });

  it('detects reuse of an old refresh token and signs out the whole session family', async () => {
    const { jar, c } = await signIn(app, A, 'admin@aurelia.example', password);
    const old = jar.get('es_rt')!;
    await c.post('/v1/auth/refresh');
    const current = jar.get('es_rt')!;
    // Push the rotation outside the race-grace window, then replay the old token (an attacker).
    await conn.collection('sessions').updateMany({ revokedReason: 'rotated' }, { $set: { revokedAt: new Date(Date.now() - 60_000) } });
    const attacker = new Jar(A);
    attacker.set('es_rt', old);
    attacker.set('es_csrf', 'x'.repeat(43));
    const replay = await client(app, attacker).post('/v1/auth/refresh');
    expect(replay.status).toBe(401);
    // The legitimate user's newer token is now dead too.
    jar.set('es_rt', current);
    expect((await c.post('/v1/auth/refresh')).status).toBe(401);
    const audit = await conn.collection('auditlogs').findOne({ action: 'auth.token_reuse' });
    expect(audit).toBeTruthy();
  });

  it('logout revokes the session server-side', async () => {
    const { jar, c } = await signIn(app, A, 'admin@aurelia.example', password);
    const access = jar.get('es_at')!;
    await c.post('/v1/auth/logout');
    const replay = new Jar(A);
    replay.set('es_at', access); // token not expired yet, but its session is gone
    expect((await client(app, replay).get('/v1/auth/me')).status).toBe(401);
  });
});

describe('roles and permissions', () => {
  it('editor cannot read leads or manage the team', async () => {
    const { c } = await signIn(app, A, 'editor@aurelia.example', password);
    expect((await c.get('/v1/admin/leads')).status).toBe(403);
    expect((await c.post('/v1/admin/team/invites', { email: 'x@example.com', role: 'agent' })).status).toBe(403);
    expect((await c.get('/v1/admin/properties')).status).toBe(200);
  });

  it('agents only see leads assigned to them', async () => {
    const { c } = await signIn(app, A, 'kabir@aurelia.example', password);
    const mine = await c.get('/v1/admin/leads?limit=100');
    expect(mine.status).toBe(200);
    expect(mine.body.scope).toBe('own');
    const all = await conn.collection('leads').countDocuments({});
    expect(mine.body.total).toBeGreaterThan(0);
    expect(mine.body.total).toBeLessThan(all);
    const kabir = await conn.collection('agents').findOne({ name: 'Kabir Malhotra' });
    for (const l of mine.body.items) expect(l.agent).toBe(kabir!.name);
  });

  it('managers see every lead', async () => {
    const { c } = await signIn(app, A, 'manager@aurelia.example', password);
    const res = await c.get('/v1/admin/leads?limit=100');
    expect(res.body.scope).toBe('all');
    expect(res.body.total).toBe(await conn.collection('leads').countDocuments({ tenantId: (await conn.collection('tenants').findOne({ slug: 'aurelia' }))!._id }));
  });

  it('admins cannot invite or promote anyone to owner', async () => {
    const { c } = await signIn(app, A, 'admin@aurelia.example', password);
    expect((await c.post('/v1/admin/team/invites', { email: 'new.owner@example.com', role: 'owner' })).status).toBe(403);
    const team = await c.get('/v1/admin/team');
    const editor = team.body.members.find((m: { email: string }) => m.email === 'editor@aurelia.example');
    expect((await c.patch(`/v1/admin/team/members/${editor.id}`, { role: 'owner' })).status).toBe(403);
    const owner = team.body.members.find((m: { email: string }) => m.email === 'owner@aurelia.example');
    expect((await c.patch(`/v1/admin/team/members/${owner.id}`, { status: 'deactivated' })).status).toBe(403);
  });

  it('nobody can change their own role or deactivate themselves', async () => {
    const { c } = await signIn(app, A, 'owner@aurelia.example', password);
    const me = await c.get('/v1/auth/me');
    const res = await c.patch(`/v1/admin/team/members/${me.body.membershipId}`, { role: 'agent' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SELF_CHANGE');
  });

  it('deactivating a member ends their live sessions immediately', async () => {
    const victim = await signIn(app, A, 'support@aurelia.example', password);
    expect((await victim.c.get('/v1/auth/me')).status).toBe(200);
    const { c } = await signIn(app, A, 'admin@aurelia.example', password);
    const team = await c.get('/v1/admin/team');
    const support = team.body.members.find((m: { email: string }) => m.email === 'support@aurelia.example');
    expect((await c.patch(`/v1/admin/team/members/${support.id}`, { status: 'deactivated' })).status).toBe(200);
    expect((await victim.c.get('/v1/auth/me')).status).toBe(401);
    expect((await signIn(app, A, 'support@aurelia.example', password)).res.status).toBe(401);
    await c.patch(`/v1/admin/team/members/${support.id}`, { status: 'active' });
  });

  it('role changes apply on the next request, without signing in again', async () => {
    const editor = await signIn(app, A, 'editor@aurelia.example', password);
    const { c } = await signIn(app, A, 'admin@aurelia.example', password);
    const team = await c.get('/v1/admin/team');
    const m = team.body.members.find((x: { email: string }) => x.email === 'editor@aurelia.example');
    await c.patch(`/v1/admin/team/members/${m.id}`, { role: 'manager' });
    expect((await editor.c.get('/v1/admin/leads')).status).toBe(200);
    await c.patch(`/v1/admin/team/members/${m.id}`, { role: 'editor' });
    expect((await editor.c.get('/v1/admin/leads')).status).toBe(403);
  });

  it('a tenant admin cannot reach another tenant’s team by id', async () => {
    const banyanOwner = await signIn(app, B, 'owner@banyan.example', password);
    const banyanTeam = await banyanOwner.c.get('/v1/admin/team');
    const target = banyanTeam.body.members[0].id;
    const { c } = await signIn(app, A, 'owner@aurelia.example', password);
    expect((await c.patch(`/v1/admin/team/members/${target}`, { status: 'deactivated' })).status).toBe(404);
  });
});

describe('invitations and password reset', () => {
  it('invites a new teammate who accepts and is signed in with the invited role', async () => {
    const { c } = await signIn(app, A, 'owner@aurelia.example', password);
    const inv = await c.post('/v1/admin/team/invites', { email: 'new.agent@example.com', role: 'agent' });
    expect(inv.status).toBe(201);
    const token = new URL(inv.body.inviteUrl).searchParams.get('token')!;
    const guest = new Jar(A);
    const g = client(app, guest);
    await g.get('/v1/auth/csrf');
    expect((await g.get(`/v1/auth/invites/${token}`)).body.roleLabel).toBe('Agent');
    const accept = await g.post('/v1/auth/accept-invite', { token, name: 'New Agent', password: 'brand-new-pass-42' });
    expect(accept.status).toBe(200);
    expect((await g.get('/v1/auth/me')).body.role).toBe('agent');
    // Single use.
    expect((await g.post('/v1/auth/accept-invite', { token, name: 'Again', password: 'brand-new-pass-42' })).status).toBe(404);
  });

  it('password reset: generic response, single-use link, all sessions revoked', async () => {
    const session = await signIn(app, A, 'manager@aurelia.example', password);
    const guest = new Jar(A);
    const g = client(app, guest);
    await g.get('/v1/auth/csrf');
    const unknown = await g.post('/v1/auth/forgot-password', { email: 'nobody@example.com' });
    const known = await g.post('/v1/auth/forgot-password', { email: 'manager@aurelia.example' });
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);

    const msg = [...(await mail())].reverse().find((m) => m.to === 'manager@aurelia.example')!;
    const token = msg.text.match(/token=([\w-]+)/)![1]!;
    expect((await g.post('/v1/auth/reset-password', { token, password: 'short' })).status).toBe(400);
    expect((await g.post('/v1/auth/reset-password', { token, password: 'a-better-password-9' })).status).toBe(200);
    expect((await g.post('/v1/auth/reset-password', { token, password: 'a-better-password-9' })).status).toBe(400);
    expect((await session.c.get('/v1/auth/me')).status).toBe(401);
    expect((await signIn(app, A, 'manager@aurelia.example', 'a-better-password-9')).res.status).toBe(200);
  });
});

describe('platform operator', () => {
  it('tenant owners cannot use platform endpoints', async () => {
    const { c } = await signIn(app, A, 'owner@aurelia.example', password);
    expect((await c.get('/v1/platform/tenants')).status).toBe(403);
  });

  it('platform owner lists agencies and can suspend and restore one', async () => {
    const { c } = await signIn(app, A, 'platform@estatery.example', password);
    const list = await c.get('/v1/platform/tenants');
    expect(list.status).toBe(200);
    const banyan = list.body.items.find((t: { slug: string }) => t.slug === 'banyan');
    expect(banyan.publishedListings).toBe(3);
    expect((await c.patch(`/v1/platform/tenants/${banyan.id}/status`, { status: 'suspended' })).status).toBe(200);
    expect((await request(app.getHttpServer()).get('/v1/site').set('Host', B)).status).toBe(403);
    await c.patch(`/v1/platform/tenants/${banyan.id}/status`, { status: 'active' });
    expect((await request(app.getHttpServer()).get('/v1/site').set('Host', B)).status).toBe(200);
  });

  it('cannot suspend the site it is signed in to', async () => {
    const { c } = await signIn(app, A, 'platform@estatery.example', password);
    const me = await c.get('/v1/auth/me');
    const res = await c.patch(`/v1/platform/tenants/${me.body.tenant.id}/status`, { status: 'suspended' });
    expect(res.status).toBe(400);
  });
});
