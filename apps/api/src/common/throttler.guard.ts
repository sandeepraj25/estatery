import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { clientIp } from './client-ip.js';

/** Rate limits per visitor *and* tenant, so one busy agency can't exhaust another's budget. */
@Injectable()
export class TenantAwareThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const r = req as Request;
    return `${r.tenant?.id?.toString() ?? 'none'}:${clientIp(r)}`;
  }
}
