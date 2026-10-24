import { reportError } from '../../common/monitoring.js';
import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { waitUntil } from '@vercel/functions';
import { isServerless, loadEnv } from '../../config/env.js';

export type JobHandler = (data: any) => Promise<void>;

const QUEUE = 'estatery';
const DEFAULTS: JobsOptions = {
  attempts: 6,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 86_400, count: 5_000 },
  removeOnFail: { age: 7 * 86_400 },
};

/**
 * Background jobs.
 *
 * With REDIS_URL: BullMQ. Jobs survive restarts, retry with exponential backoff, and can be
 * processed by separate worker processes (`node dist/worker.js`). Repeatable jobs run once per
 * interval across all instances.
 * Without REDIS_URL: jobs run in this process right after the request, with a few retries.
 * Fine for development and single-server installs; nothing is persisted across restarts.
 * On Vercel (serverless): always inline. There is no process to run a BullMQ worker, so in-process
 * jobs are kept alive past the response with waitUntil, and repeatable jobs are run by Vercel Cron
 * through runRepeatables().
 */
@Injectable()
export class QueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('Queue');
  private readonly env = loadEnv();
  private readonly handlers = new Map<string, JobHandler>();
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private connection: Redis | null = null;
  private readonly pending = new Set<Promise<void>>();
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly repeatables: Array<{ name: string; everyMs: number }> = [];

  get mode() {
    return this.env.REDIS_URL && !isServerless ? 'bullmq' : 'inline';
  }

  register(name: string, handler: JobHandler) {
    this.handlers.set(name, handler);
  }

  async onModuleInit() {
    if (!this.env.REDIS_URL || isServerless) return;
    this.connection = new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUE, { connection: this.connection, defaultJobOptions: DEFAULTS });
  }

  /** Called once all handlers are registered (by JobsService). */
  async startWorkers() {
    if (this.env.RUN_WORKERS !== 'true') return;
    if (this.queue && this.connection) {
      this.worker = new Worker(
        QUEUE,
        async (job) => {
          const h = this.handlers.get(job.name);
          if (!h) throw new Error(`No handler for job "${job.name}"`);
          await h(job.data);
        },
        { connection: this.connection.duplicate(), concurrency: 5 },
      );
      this.worker.on('failed', (job, err) => {
        this.logger.warn(`Job ${job?.name} failed (attempt ${job?.attemptsMade}): ${err.message}`);
        // Report only when retries are exhausted, so a flaky SMTP minute doesn't page anyone.
        if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) reportError(err, { job: job.name });
      });
      for (const r of this.repeatables) {
        await this.queue.upsertJobScheduler(`repeat:${r.name}`, { every: r.everyMs }, { name: r.name, data: {} });
      }
    } else if (this.env.NODE_ENV !== 'test') {
      for (const r of this.repeatables) {
        const t = setInterval(() => void this.enqueue(r.name, {}), r.everyMs);
        t.unref();
        this.timers.push(t);
      }
    }
  }

  /** Declare a job that should run every `everyMs` (registered before startWorkers). */
  repeat(name: string, everyMs: number) {
    this.repeatables.push({ name, everyMs });
  }

  async enqueue(name: string, data: Record<string, unknown>, opts: JobsOptions = {}) {
    if (this.queue) {
      await this.queue.add(name, data, opts);
      return;
    }
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`No handler for job "${name}"`);
    const run = (async () => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await handler(data);
          return;
        } catch (e) {
          this.logger.warn(`Job ${name} failed (attempt ${attempt}/3): ${(e as Error).message}`);
          if (attempt < 3) await new Promise((r) => setTimeout(r, this.env.NODE_ENV === 'test' ? 5 : 1000 * attempt));
          else reportError(e, { job: name });
        }
      }
    })();
    this.pending.add(run);
    void run.finally(() => this.pending.delete(run));
    // A serverless function may be frozen once the response is sent; keep it alive until the job ends.
    if (isServerless) waitUntil(run);
  }

  /**
   * Runs every repeatable job once, now, and waits for it. Used by the Vercel Cron endpoint, which
   * replaces the interval timers / BullMQ schedulers that a serverless function cannot keep.
   */
  async runRepeatables() {
    const results: Record<string, 'ok' | 'failed'> = {};
    for (const r of this.repeatables) {
      const handler = this.handlers.get(r.name);
      if (!handler) continue;
      try {
        await handler({});
        results[r.name] = 'ok';
      } catch (e) {
        results[r.name] = 'failed';
        reportError(e, { job: r.name });
      }
    }
    return results;
  }

  /** Waits for in-process jobs to finish (tests, graceful shutdown). */
  async drain() {
    while (this.pending.size) await Promise.all([...this.pending]);
  }

  async onApplicationShutdown() {
    this.timers.forEach(clearInterval);
    await this.drain();
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit().catch(() => undefined);
  }
}
