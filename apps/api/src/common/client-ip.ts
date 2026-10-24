import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { loadEnv } from '../config/env.js';

/**
 * The visitor's IP. Requests proxied by our Next.js server carry it in X-Client-IP, which we only
 * believe when the internal key is valid — otherwise anyone could rotate the header to dodge rate limits.
 */
export function clientIp(req: Request): string {
  const key = req.header('x-internal-key');
  const expected = loadEnv().INTERNAL_API_KEY;
  if (key && key.length === expected.length && timingSafeEqual(Buffer.from(key), Buffer.from(expected))) {
    const forwarded = req.header('x-client-ip');
    if (forwarded && /^[0-9a-fA-F:.]{3,45}$/.test(forwarded)) return forwarded;
  }
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
