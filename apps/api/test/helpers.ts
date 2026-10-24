import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import mongoose, { type Connection } from 'mongoose';
import request from 'supertest';

export const KEY = 'test-internal-key-0123456789abcdef';

/** Boots the real app against a fresh throwaway database. Call once per test file. */
export async function bootTestApp(label: string) {
  const base = process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017';
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = `${base}/estatery_test_${label}_${Date.now()}`;
  process.env.INTERNAL_API_KEY = KEY;
  process.env.JWT_ACCESS_SECRET = 'test-jwt-secret-0123456789abcdef0123456789';
  process.env.TENANT_CACHE_TTL_MS = '0';
  process.env.LOGIN_MAX_ATTEMPTS = '3';
  process.env.AUTH_RATE_LIMIT_PER_MIN = '1000';
  delete process.env.REDIS_URL; // inline jobs unless a test opts in
  if (label.startsWith('redis')) process.env.REDIS_URL = process.env.REDIS_TEST_URL ?? 'redis://127.0.0.1:6379/15';
  process.env.MEDIA_DRIVER = 'local';
  process.env.TLS_ASK_TOKEN = 'test-tls-ask-token-0123456789abcdef';
  process.env.DOMAIN_CNAME_TARGET = 'sites.estatery.app';
  process.env.DOMAIN_A_RECORDS = '203.0.113.10';
  process.env.PLATFORM_DOMAIN = 'estatery.app';
  process.env.DOMAIN_RATE_LIMIT_PER_MIN = '1000';
  process.env.DOMAIN_MAX_PER_TENANT = '25';
  process.env.MEDIA_LOCAL_DIR = `/tmp/estatery-test-media-${label}-${Date.now()}`;
  const { resetEnvCache } = await import('../src/config/env.js');
  resetEnvCache();
  const { seedDatabase, SEED_PASSWORD } = await import('../src/scripts/seed.js');
  const { createApp } = await import('../src/bootstrap.js');
  const conn: Connection = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
  const ids = await seedDatabase(conn);
  const app: INestApplication = await createApp();
  await app.init();
  return { app, conn, ids, password: SEED_PASSWORD, close: async () => { await app.close(); await conn.dropDatabase(); await conn.close(); } };
}

/** Minimal cookie jar: superagent's jar matches on the URL host, not our Host header. */
export class Jar {
  private cookies = new Map<string, string>();
  constructor(public host: string) {}
  store(res: request.Response) {
    const set = res.headers['set-cookie'] as unknown as string[] | undefined;
    for (const c of set ?? []) {
      const [pair] = c.split(';');
      const idx = pair!.indexOf('=');
      const name = pair!.slice(0, idx);
      const value = pair!.slice(idx + 1);
      if (!value || /Expires=Thu, 01 Jan 1970/i.test(c)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return res;
  }
  get(name: string) {
    return this.cookies.get(name);
  }
  set(name: string, value: string) {
    this.cookies.set(name, value);
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

export function client(app: INestApplication, jar: Jar) {
  const srv = app.getHttpServer();
  const withCommon = (r: request.Test) => r.set('Host', jar.host).set('Cookie', jar.header());
  return {
    get: async (url: string) => jar.store(await withCommon(request(srv).get(url))),
    post: async (url: string, body: object = {}, csrf = true) =>
      jar.store(await withCommon(request(srv).post(url)).set(csrf ? { 'x-csrf-token': jar.get('es_csrf') ?? '' } : {}).send(body)),
    patch: async (url: string, body: object, csrf = true) =>
      jar.store(await withCommon(request(srv).patch(url)).set(csrf ? { 'x-csrf-token': jar.get('es_csrf') ?? '' } : {}).send(body)),
    put: async (url: string, body: object, csrf = true) =>
      jar.store(await withCommon(request(srv).put(url)).set(csrf ? { 'x-csrf-token': jar.get('es_csrf') ?? '' } : {}).send(body)),
    del: async (url: string) => jar.store(await withCommon(request(srv).delete(url)).set({ 'x-csrf-token': jar.get('es_csrf') ?? '' })),
  };
}

export async function signIn(app: INestApplication, host: string, email: string, password: string) {
  const jar = new Jar(host);
  const c = client(app, jar);
  await c.get('/v1/auth/csrf');
  const res = await c.post('/v1/auth/login', { email, password });
  return { jar, c, res };
}
