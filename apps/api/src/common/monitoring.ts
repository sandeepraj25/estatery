import * as Sentry from '@sentry/node';
import { Logger } from '@nestjs/common';
import { loadEnv } from '../config/env.js';

const logger = new Logger('Monitoring');
let enabled = false;

/**
 * Error reporting. With SENTRY_DSN set, unexpected errors go to Sentry (no request bodies,
 * cookies or personal data are sent). Without it, they are logged as structured JSON lines that
 * any log collector can alert on.
 */
export function initMonitoring(service: 'api' | 'worker') {
  const env = loadEnv();
  if (!env.SENTRY_DSN || enabled) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: env.APP_VERSION,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    initialScope: { tags: { service } },
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        if (event.request.headers) event.request.headers = { 'user-agent': event.request.headers['user-agent'] ?? '' };
      }
      return event;
    },
  });
  enabled = true;
  logger.log('Error reporting to Sentry is on');
}

export interface ErrorContext {
  requestId?: string;
  tenant?: string;
  path?: string;
  method?: string;
  job?: string;
}

export function reportError(err: unknown, ctx: ErrorContext = {}) {
  const e = err instanceof Error ? err : new Error(String(err));
  if (enabled) {
    Sentry.withScope((scope) => {
      for (const [k, v] of Object.entries(ctx)) if (v) scope.setTag(k, v);
      Sentry.captureException(e);
    });
  }
  // One JSON line per error, whether or not Sentry is configured.
  process.stderr.write(`${JSON.stringify({ level: 'error', time: new Date().toISOString(), msg: e.message, name: e.name, stack: e.stack?.split('\n').slice(0, 8).join('\n'), ...ctx })}\n`);
}

export async function flushMonitoring() {
  if (enabled) await Sentry.flush(2000);
}
