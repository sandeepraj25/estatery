import { NextResponse, type NextRequest } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';
const KEY = process.env.API_INTERNAL_KEY ?? '';

/**
 * Razorpay webhook URL: https://<platform domain>/api/webhooks/razorpay
 *
 * The API isn't public, so this forwards the request body byte-for-byte with the internal key.
 * Verification (HMAC signature, replay protection) happens in the API against the raw body.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 1_000_000) return NextResponse.json({ error: { code: 'TOO_LARGE', message: 'Payload too large' } }, { status: 413 });
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-internal-key': KEY };
  for (const h of ['x-razorpay-signature', 'x-razorpay-event-id'] as const) {
    const v = req.headers.get(h);
    if (v) headers[h] = v;
  }
  try {
    const res = await fetch(`${API_URL}/internal/billing/razorpay-webhook`, { method: 'POST', headers, body: raw, cache: 'no-store' });
    return new NextResponse(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch {
    // Razorpay retries non-2xx responses, so a brief API outage loses nothing.
    return NextResponse.json({ error: { code: 'UNAVAILABLE', message: 'Try again later' } }, { status: 503 });
  }
}
