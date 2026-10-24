import { Injectable, type NestMiddleware } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { loadEnv } from '../../config/env.js';
import { TenantsService } from './tenants.service.js';

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Resolves the tenant for every /v1 request.
 *
 * - Requests from the Next.js server carry X-Internal-Key + X-Tenant-Host (the visitor's host).
 * - Any other request is resolved from its own Host header.
 * A browser can't spoof X-Tenant-Host because it doesn't know the internal key.
 */
@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  private readonly key = loadEnv().INTERNAL_API_KEY;

  constructor(private readonly tenants: TenantsService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    try {
      const internal = req.header('x-internal-key');
      const forwarded = req.header('x-tenant-host');
      const trusted = internal !== undefined && safeEqual(internal, this.key);
      const host = trusted && forwarded ? forwarded : req.header('host');
      req.tenant = await this.tenants.resolveHost(host);
      next();
    } catch (err) {
      next(err);
    }
  }
}
