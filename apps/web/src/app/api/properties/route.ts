import { NextResponse, type NextRequest } from 'next/server';
import { propertyQuerySchema } from '@estatery/shared';
import { ApiError, apiFetch } from '@/lib/api';
import type { Paginated, PublicProperty } from '@estatery/shared';

/** Same-origin read proxy for client-side lists (saved homes, recently viewed). */
export async function GET(req: NextRequest) {
  const parsed = propertyQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_FAILED', message: 'Invalid search.' } }, { status: 400 });
  }
  try {
    const data = await apiFetch<Paginated<PublicProperty>>(`/v1/properties?${req.nextUrl.searchParams.toString()}`);
    return NextResponse.json(data, { headers: { 'cache-control': 'private, max-age=30' } });
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 502;
    return NextResponse.json({ error: { code: 'API_ERROR', message: 'Could not load properties.' } }, { status });
  }
}
