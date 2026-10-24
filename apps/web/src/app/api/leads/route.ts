import { NextResponse, type NextRequest } from 'next/server';
import { ApiError, apiFetch } from '@/lib/api';

/**
 * Same-origin proxy for enquiry forms. The browser never talks to the API directly, so it never
 * needs the internal key, and the API sees the real visitor host + IP for tenancy and rate limits.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 20_000) return NextResponse.json({ error: { code: 'TOO_LARGE', message: 'Request is too large.' } }, { status: 413 });
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  // CSRF: only accept same-origin form posts.
  if (origin && host && new URL(origin).host !== host) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Cross-site request blocked.' } }, { status: 403 });
  }
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? undefined;
  try {
    const data = await apiFetch('/v1/leads', { method: 'POST', body: raw, clientIp });
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: { code: e.code, message: e.message, fields: e.fields } }, { status: e.status });
    }
    return NextResponse.json({ error: { code: 'API_UNREACHABLE', message: 'The service is unavailable. Please try again shortly.' } }, { status: 502 });
  }
}
