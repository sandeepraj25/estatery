import type { Instrumentation } from 'next';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initMonitoring } = await import('./lib/monitoring');
    initMonitoring();
  }
}

/** Every uncaught error while rendering a page or running a route handler on the server. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { reportError } = await import('./lib/monitoring');
  const e = err as Error & { digest?: string };
  // notFound()/redirect() are control flow, not errors.
  if (typeof e.digest === 'string' && /^(NEXT_NOT_FOUND|NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK)/.test(e.digest)) return;
  reportError(err, {
    path: request.path.split('?')[0],
    method: request.method,
    host: (request.headers['x-forwarded-host'] ?? request.headers.host) as string | undefined,
    route: context.routePath,
    kind: context.routerKind,
    digest: e.digest,
  });
};
