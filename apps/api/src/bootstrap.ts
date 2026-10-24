import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express from 'express';
import { resolve } from 'node:path';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { initMonitoring } from './common/monitoring.js';
import { randomUUID } from 'node:crypto';
import { loadEnv } from './config/env.js';

/** Shared by main.ts and the e2e tests so tests exercise the real middleware stack. */
export async function createApp() {
  const env = loadEnv();
  initMonitoring('api');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: env.NODE_ENV === 'test' ? ['error'] : ['log', 'warn', 'error'],
    // Keeps req.rawBody so webhook signatures are checked against the exact bytes received.
    rawBody: true,
  });
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  // Every response carries a request id (kept from the web server when it sends one) for tracing.
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const incoming = req.header('x-request-id');
    res.setHeader('x-request-id', incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID());
    next();
  });
  app.use(cookieParser());
  // Larger limit only matters for CSV import; everything else is validated far below it by Zod.
  app.useBodyParser('json', { limit: '2mb' });
  app.enableCors({
    origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true,
  });
  app.useGlobalFilters(new HttpExceptionFilter());

  if (env.MEDIA_DRIVER === 'local') {
    // Uploaded images (local driver only; production should use S3 + CDN). Only API-generated
    // file names are servable: /media/<tenantId>/<id>-<rand>.webp
    const root = resolve(env.MEDIA_LOCAL_DIR, 'tenants');
    const files = express.static(root, { dotfiles: 'deny', index: false, fallthrough: false, immutable: true, maxAge: '365d' });
    app.use('/media', (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!/^\/[a-f0-9]{24}\/[a-f0-9]{24}-[a-f0-9]{8}\.webp$/.test(req.path)) return res.status(404).end();
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Missing files are a plain 404, never an error page.
      return files(req, res, (err?: unknown) => (err ? res.status(404).end() : next()));
    });
  }
  app.enableShutdownHooks();
  return app;
}
