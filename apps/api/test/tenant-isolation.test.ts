import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import type mongoose from 'mongoose';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * End-to-end tests against the real Nest app and a real MongoDB-compatible database.
 * Each run uses its own throwaway database. Set MONGODB_TEST_URI to point elsewhere.
 */
import { bootTestApp, KEY } from './helpers.js';

let app: INestApplication;
let conn: Connection;
let ids: { aurelia: mongoose.Types.ObjectId; banyan: mongoose.Types.ObjectId };
let close: () => Promise<void>;

const A = 'aurelia.localhost';
const B = 'banyan.localhost';
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  ({ app, conn, ids, close } = await bootTestApp('iso'));
});
afterAll(async () => close?.());

describe('tenant resolution', () => {
  it('rejects unknown hostnames', async () => {
    const res = await http().get('/v1/properties').set('Host', 'unknown.example');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TENANT_NOT_FOUND');
  });

  it('rejects malformed Host headers', async () => {
    const res = await http().get('/v1/properties').set('Host', 'bad host$');
    expect(res.status).toBe(404);
  });

  it('ignores X-Tenant-Host from untrusted callers (no internal key)', async () => {
    const res = await http().get('/v1/site').set('Host', A).set('X-Tenant-Host', B);
    expect(res.status).toBe(200);
    expect(res.body.tenant.slug).toBe('aurelia');
  });

  it('ignores X-Tenant-Host with a wrong internal key', async () => {
    const res = await http().get('/v1/site').set('Host', A).set('X-Tenant-Host', B).set('X-Internal-Key', 'x'.repeat(KEY.length));
    expect(res.body.tenant.slug).toBe('aurelia');
  });

  it('honours X-Tenant-Host from the trusted web server', async () => {
    const res = await http().get('/v1/site').set('Host', A).set('X-Tenant-Host', B).set('X-Internal-Key', KEY);
    expect(res.body.tenant.slug).toBe('banyan');
  });

  it('blocks suspended tenants', async () => {
    await conn.collection('tenants').updateOne({ _id: ids.banyan }, { $set: { status: 'suspended' } });
    const res = await http().get('/v1/properties').set('Host', B);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TENANT_SUSPENDED');
    await conn.collection('tenants').updateOne({ _id: ids.banyan }, { $set: { status: 'active' } });
  });

  it('does not route unverified custom domains', async () => {
    await conn.collection('domains').insertOne({ hostname: 'hijack.example', tenantId: ids.aurelia, kind: 'custom', verified: false });
    const res = await http().get('/v1/properties').set('Host', 'hijack.example');
    expect(res.status).toBe(404);
  });
});

describe('cross-tenant data isolation', () => {
  it('lists only the current tenant’s properties', async () => {
    const a = await http().get('/v1/properties?limit=48').set('Host', A);
    const b = await http().get('/v1/properties?limit=48').set('Host', B);
    const aIds = new Set(a.body.items.map((p: { id: string }) => p.id));
    expect(a.body.total).toBeGreaterThan(0);
    expect(b.body.total).toBe(3);
    for (const p of b.body.items) expect(aIds.has(p.id)).toBe(false);
  });

  it('cannot open another tenant’s property by slug', async () => {
    const res = await http().get('/v1/properties/banyan-greens-2bhk').set('Host', A);
    expect(res.status).toBe(404);
    const own = await http().get('/v1/properties/banyan-greens-2bhk').set('Host', B);
    expect(own.status).toBe(200);
  });

  it('cannot attach a lead to another tenant’s property', async () => {
    const b = await http().get('/v1/properties?limit=1').set('Host', B);
    const before = await conn.collection('leads').countDocuments({});
    const res = await http()
      .post('/v1/leads')
      .set('Host', A)
      .send({ name: 'Cross Tenant', email: 'x@example.com', phone: '+91 98765 43210', consent: true, propertyId: b.body.items[0].id });
    expect(res.status).toBe(400);
    expect(await conn.collection('leads').countDocuments({})).toBe(before);
  });

  it('stores leads under the hostname tenant, ignoring any tenantId in the body', async () => {
    const res = await http()
      .post('/v1/leads')
      .set('Host', B)
      .send({ name: 'Priya', email: 'p@example.com', phone: '+91 98765 43210', consent: true, tenantId: ids.aurelia.toString() });
    expect(res.status).toBe(201);
    const lead = await conn.collection('leads').findOne({ email: 'p@example.com' });
    expect(lead?.tenantId.toString()).toBe(ids.banyan.toString());
  });

  it('serves each tenant its own published theme and homepage', async () => {
    const a = await http().get('/v1/site').set('Host', A);
    const b = await http().get('/v1/site').set('Host', B);
    expect(a.body.settings.businessName).toBe('Aurelia Estates');
    expect(b.body.settings.businessName).toBe('Banyan & Co. Realty');
    expect(a.body.theme.colors.primary).not.toBe(b.body.theme.colors.primary);
  });
});

describe('tenant scope guard (database layer)', () => {
  it('throws on any unscoped query against a tenant-owned collection', async () => {
    const Property = conn.models.Property!;
    await expect(Property.find({ status: 'published' }).exec()).rejects.toThrow(/Unscoped find/);
    await expect(Property.deleteMany({}).exec()).rejects.toThrow(/Unscoped deleteMany/);
    await expect(Property.aggregate([{ $group: { _id: null, n: { $sum: 1 } } }]).exec()).rejects.toThrow(/Unscoped aggregate/);
    await expect(Property.updateMany({ featured: true }, { $set: { featured: false } }).exec()).rejects.toThrow(/Unscoped updateMany/);
  });

  it('allows explicitly audited cross-tenant platform queries', async () => {
    const Property = conn.models.Property!;
    const n = await Property.countDocuments({}).setOptions({ crossTenant: true });
    expect(n).toBeGreaterThan(3);
  });
});

describe('public listing rules', () => {
  it('never exposes draft listings', async () => {
    const list = await http().get('/v1/properties?limit=48&q=Kashid').set('Host', A);
    expect(list.body.total).toBe(0);
    const detail = await http().get('/v1/properties/draft-coastal-plot-kashid').set('Host', A);
    expect(detail.status).toBe(404);
  });

  it('filters and sorts server-side', async () => {
    const res = await http().get('/v1/properties?city=mumbai&listingType=sale&sort=price-asc').set('Host', A);
    expect(res.status).toBe(200);
    const prices = res.body.items.map((p: { price: number }) => p.price);
    expect(prices).toEqual([...prices].sort((x, y) => x - y));
    for (const p of res.body.items) {
      expect(p.location.city).toBe('Mumbai');
      expect(p.listingType).toBe('sale');
    }
  });

  it('treats regex characters in keyword search literally', async () => {
    const res = await http().get('/v1/properties?q=.*').set('Host', A);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it('rejects out-of-range pagination and invalid enums', async () => {
    expect((await http().get('/v1/properties?limit=1000').set('Host', A)).status).toBe(400);
    expect((await http().get('/v1/properties?type=castle').set('Host', A)).status).toBe(400);
    expect((await http().get('/v1/properties?minPrice=5&maxPrice=1').set('Host', A)).status).toBe(400);
  });

  it('rate-limits enquiry submissions per visitor', async () => {
    const body = { name: 'Rate Test', email: 'r@example.com', phone: '+91 98765 43210', consent: true };
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await http().post('/v1/leads').set('Host', A).send(body)).status);
    expect(statuses).toContain(429);
  });
});
