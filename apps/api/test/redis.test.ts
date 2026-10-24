import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisThrottlerStorage } from '../src/common/redis-throttler.storage.js';

/**
 * Exercises the Redis paths (BullMQ jobs, shared rate limits). Skipped when no Redis is reachable.
 * Uses database 15 by default; override with REDIS_TEST_URL.
 */
const url = process.env.REDIS_TEST_URL ?? 'redis://127.0.0.1:6379/15';
const probe = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null });
const available = await probe.connect().then(() => true).catch(() => false);
if (available) await probe.flushdb();

describe.skipIf(!available)('with Redis', () => {
  let app: INestApplication;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const { bootTestApp } = await import('./helpers.js');
    ({ app, close } = await bootTestApp('redis'));
  });
  afterAll(async () => {
    await close?.();
    await probe.quit();
  });

  it('rate-limit counters are shared through Redis and block after the limit', async () => {
    const store = new RedisThrottlerStorage(probe, 'rl-test:');
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await store.increment('k', 60_000, 3, 60_000, 'default'));
    expect(results.map((r) => r.totalHits)).toEqual([1, 2, 3, 4]);
    expect(results[2]!.isBlocked).toBe(false);
    expect(results[3]!.isBlocked).toBe(true);
    expect(results[3]!.timeToBlockExpire).toBeGreaterThan(0);
  });

  it('a new enquiry is processed by a BullMQ worker and the advisor is emailed', async () => {
    const { QueueService } = await import('../src/modules/jobs/queue.service.js');
    const { MailService } = await import('../src/modules/mail/mail.service.js');
    expect(app.get(QueueService).mode).toBe('bullmq');
    const conn = (app.get('DatabaseConnection') as import('mongoose').Connection);
    const glasshouse = await conn.collection('properties').findOne({ slug: 'the-glasshouse-alibaug' });
    const before = app.get(MailService).outbox.length;
    const res = await request(app.getHttpServer()).post('/v1/leads').set('Host', 'aurelia.localhost')
      .send({ name: 'Queued Lead', email: 'q@example.com', phone: '+91 98200 22222', consent: true, propertyId: glasshouse!._id.toString() });
    expect(res.status).toBe(201);
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && !app.get(MailService).outbox.slice(before).some((m) => m.to === 'kabir@aurelia.example')) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(app.get(MailService).outbox.slice(before).some((m) => m.to === 'kabir@aurelia.example' && m.subject.includes('Queued Lead'))).toBe(true);
  });
});
