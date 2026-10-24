import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { reportError } from '@/lib/monitoring';

const body = z.object({
  message: z.string().max(500),
  digest: z.string().max(100).optional(),
  path: z.string().max(300),
  area: z.enum(['site', 'admin']),
});

// A crashed page shouldn't be able to flood the logs: a small per-visitor allowance.
const recent = new Map<string, { n: number; until: number }>();

/** Errors caught by the browser-side error screens. Only the message and page path are kept. */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const now = Date.now();
  const r = recent.get(ip);
  if (r && r.until > now && r.n >= 10) return new NextResponse(null, { status: 204 });
  recent.set(ip, r && r.until > now ? { n: r.n + 1, until: r.until } : { n: 1, until: now + 60_000 });
  if (recent.size > 5000) recent.clear();

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const e = new Error(parsed.data.message);
  e.name = 'ClientError';
  reportError(e, { path: parsed.data.path.split('?')[0], digest: parsed.data.digest, area: parsed.data.area, host: req.headers.get('host') ?? undefined });
  return new NextResponse(null, { status: 204 });
}
