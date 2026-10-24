import { Body, Controller, Get, Headers, HttpCode, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import {
  cancelSchema, checkoutSchema, checkoutVerifySchema, platformBillingSchema, simulateSchema,
  type CheckoutInput, type PlatformBillingInput,
} from '@estatery/shared';
import type { z } from 'zod';
import { clientIp } from '../../common/client-ip.js';
import { CsrfGuard } from '../../common/csrf.guard.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { CurrentTenant, type ResolvedTenant } from '../../common/tenancy/tenant.context.js';
import { loadEnv } from '../../config/env.js';
import { AuthGuard, CurrentUser, PlatformOnly, RequirePermission, type AuthContext } from '../auth/auth.guard.js';
import { BillingService } from './billing.service.js';

/** The agency's own subscription. Only owners (billing:manage) can see or change it. */
@Controller('v1/admin/billing')
@UseGuards(AuthGuard, CsrfGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @RequirePermission('billing:manage')
  overview(@CurrentTenant() t: ResolvedTenant) {
    return this.billing.overview(t.id);
  }

  /** Plan state for banners; any signed-in member. */
  @Get('summary')
  summary(@CurrentTenant() t: ResolvedTenant) {
    return this.billing.summary(t.id);
  }

  @Post('checkout')
  @HttpCode(200)
  @RequirePermission('billing:manage')
  checkout(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Body(new ZodPipe(checkoutSchema)) b: CheckoutInput, @Req() req: Request) {
    return this.billing.checkout(t, u, b, clientIp(req));
  }

  @Post('verify')
  @HttpCode(200)
  @RequirePermission('billing:manage')
  verify(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Body(new ZodPipe(checkoutVerifySchema)) b: z.output<typeof checkoutVerifySchema>, @Req() req: Request) {
    return this.billing.verifyCheckout(t, u, b, clientIp(req));
  }

  @Post('change')
  @HttpCode(200)
  @RequirePermission('billing:manage')
  change(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Body(new ZodPipe(checkoutSchema)) b: CheckoutInput, @Req() req: Request) {
    return this.billing.changePlan(t, u, b, clientIp(req));
  }

  @Post('cancel')
  @HttpCode(200)
  @RequirePermission('billing:manage')
  cancel(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Body(new ZodPipe(cancelSchema)) b: z.output<typeof cancelSchema>, @Req() req: Request) {
    return this.billing.cancel(t, u, b, clientIp(req));
  }

  /** Test mode only (404 otherwise): plays Razorpay's part so the flow can be tried locally. */
  @Post('simulate')
  @HttpCode(200)
  @RequirePermission('billing:manage')
  simulate(@CurrentTenant() t: ResolvedTenant, @Body(new ZodPipe(simulateSchema)) b: z.output<typeof simulateSchema>) {
    return this.billing.simulate(t, b);
  }
}

@Controller('v1/platform/tenants')
@UseGuards(AuthGuard, CsrfGuard)
@PlatformOnly()
export class PlatformBillingController {
  constructor(private readonly billing: BillingService) {}

  @Patch(':id/billing')
  update(@CurrentUser() u: AuthContext, @Param('id') id: string, @Body(new ZodPipe(platformBillingSchema)) b: PlatformBillingInput, @Req() req: Request) {
    return this.billing.platformAction(u, id, b, clientIp(req));
  }
}

const sameKey = (given: string | undefined, expected: string) =>
  !!given && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));

/**
 * Razorpay webhooks. The API is never public: Razorpay calls https://<platform>/api/webhooks/razorpay
 * on the web server, which forwards the untouched body here with the internal key. The Razorpay
 * signature is still checked against the raw bytes, so the web server can't forge events either.
 */
@Controller('internal/billing')
export class BillingWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post('razorpay-webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-internal-key') key: string | undefined,
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Headers('x-razorpay-event-id') eventId: string | undefined,
  ) {
    if (!sameKey(key, loadEnv().INTERNAL_API_KEY)) throw new NotFoundException();
    const raw = req.rawBody?.toString('utf8') ?? '';
    return this.billing.handleWebhook(raw, signature, eventId);
  }
}
