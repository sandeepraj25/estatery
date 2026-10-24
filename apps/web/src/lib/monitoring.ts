import 'server-only';
import * as Sentry from '@sentry/node';

let enabled = false;

/** Server-side error reporting for the web app (same behaviour as the API: Sentry if configured, JSON logs always). */
export function initMonitoring() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || enabled) return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.APP_VERSION,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    initialScope: { tags: { service: 'web' } },
  });
  enabled = true;
}

export function reportError(err: unknown, ctx: Record<string, string | undefined> = {}) {
  const e = err instanceof Error ? err : new Error(String(err));
  if (enabled) {
    Sentry.withScope((scope) => {
      for (const [k, v] of Object.entries(ctx)) if (v) scope.setTag(k, v.slice(0, 200));
      Sentry.captureException(e);
    });
  }
  process.stderr.write(`${JSON.stringify({ level: 'error', time: new Date().toISOString(), service: 'web', msg: e.message, stack: e.stack?.split('\n').slice(0, 8).join('\n'), ...ctx })}\n`);
}
