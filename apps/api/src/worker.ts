import 'reflect-metadata';
import { initMonitoring } from './common/monitoring.js';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadEnv } from './config/env.js';

/**
 * Dedicated job worker: `node dist/worker.js`. Use it with REDIS_URL set and RUN_WORKERS=false on
 * the web-facing API nodes, so slow jobs (email, DNS checks) never compete with requests.
 */
if (!loadEnv().REDIS_URL) {
  console.error('worker.js needs REDIS_URL; without Redis, jobs run inside the API process.');
  process.exit(1);
}
process.env.RUN_WORKERS = 'true';
initMonitoring('worker');
const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
app.enableShutdownHooks();
console.log('Worker started');
