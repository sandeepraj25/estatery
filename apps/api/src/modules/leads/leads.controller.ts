import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { createLeadSchema } from '@estatery/shared';
import type { z } from 'zod';
import { clientIp } from '../../common/client-ip.js';
import { TenantAwareThrottlerGuard } from '../../common/throttler.guard.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { CurrentTenant, type ResolvedTenant } from '../../common/tenancy/tenant.context.js';
import { LeadsService } from './leads.service.js';

@Controller('v1/leads')
@UseGuards(TenantAwareThrottlerGuard)
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  /** Public enquiry / callback / site-visit request. 5 per minute per visitor per site. */
  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(
    @CurrentTenant() tenant: ResolvedTenant,
    @Body(new ZodPipe(createLeadSchema)) body: z.output<typeof createLeadSchema>,
    @Req() req: Request,
  ) {
    return this.leads.create(tenant.id, body, { ip: clientIp(req), userAgent: req.header('user-agent') ?? null });
  }
}
