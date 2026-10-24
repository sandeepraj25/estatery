import { Body, Controller, Get, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import {
  acceptInviteSchema, changePasswordSchema, forgotPasswordSchema, loginSchema, resetPasswordSchema,
} from '@estatery/shared';
import { clientIp } from '../../common/client-ip.js';
import { loadEnv } from '../../config/env.js';
import { CsrfGuard } from '../../common/csrf.guard.js';
import { TenantAwareThrottlerGuard } from '../../common/throttler.guard.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { CurrentTenant, type ResolvedTenant } from '../../common/tenancy/tenant.context.js';
import { AuthGuard, CurrentUser, type AuthContext } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { clearAuthCookies, cookieNames, readCookie, setAuthCookies, setCsrfCookie } from './cookies.js';
import { randomToken } from './tokens.service.js';

const HOST = /^[a-z0-9.-]{1,253}(:\d{1,5})?$/i;
/** Resolved per request so the limit follows configuration (tests raise it). */
const authLimit = (factor = 1) => ({ default: { limit: () => Math.max(1, Math.ceil(loadEnv().AUTH_RATE_LIMIT_PER_MIN * factor)), ttl: 60_000 } });

function meta(req: Request, tenant: ResolvedTenant) {
  const forwarded = req.header('x-tenant-host');
  const raw = forwarded && HOST.test(forwarded) ? forwarded : req.header('host');
  return { ip: clientIp(req), userAgent: req.header('user-agent') ?? null, host: raw && HOST.test(raw) ? raw : tenant.hostname };
}

/**
 * Authentication endpoints. Every state-changing call needs the CSRF header, and sign-in related
 * calls are rate limited per visitor per site on top of per-account lockout.
 */
@Controller('v1/auth')
@UseGuards(TenantAwareThrottlerGuard, CsrfGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Issues the double-submit CSRF cookie. The admin UI calls this before showing any form. */
  @Get('csrf')
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const existing = readCookie(req, cookieNames().csrf);
    const token = existing && existing.length >= 32 ? existing : randomToken();
    setCsrfCookie(res, token);
    return { csrfToken: token };
  }

  @Post('login')
  @HttpCode(200)
  @Throttle(authLimit())
  async login(
    @CurrentTenant() tenant: ResolvedTenant,
    @Body(new ZodPipe(loginSchema)) body: z.output<typeof loginSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.login(tenant, body.email, body.password, meta(req, tenant));
    setAuthCookies(res, tokens);
    setCsrfCookie(res, randomToken()); // rotate CSRF token on privilege change
    return { ok: true };
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle(authLimit(3))
  async refresh(@CurrentTenant() tenant: ResolvedTenant, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const tokens = await this.auth.refresh(tenant, readCookie(req, cookieNames().refresh), meta(req, tenant));
      setAuthCookies(res, tokens);
      return { ok: true };
    } catch (e) {
      if ((e as { status?: number }).status === 401) clearAuthCookies(res);
      throw e;
    }
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentTenant() tenant: ResolvedTenant, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(tenant, readCookie(req, cookieNames().refresh));
    clearAuthCookies(res);
    return { ok: true };
  }

  @Post('logout-all')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async logoutAll(@CurrentTenant() tenant: ResolvedTenant, @CurrentUser() user: AuthContext, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutAll(tenant, user, clientIp(req));
    clearAuthCookies(res);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentTenant() tenant: ResolvedTenant, @CurrentUser() user: AuthContext) {
    return this.auth.me(tenant, user);
  }

  @Post('forgot-password')
  @HttpCode(202)
  @Throttle(authLimit(0.5))
  async forgot(@CurrentTenant() tenant: ResolvedTenant, @Body(new ZodPipe(forgotPasswordSchema)) body: z.output<typeof forgotPasswordSchema>, @Req() req: Request) {
    await this.auth.forgotPassword(tenant, body.email, meta(req, tenant));
    return { ok: true, message: 'If that email belongs to an account here, a reset link is on its way.' };
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle(authLimit())
  async reset(@CurrentTenant() tenant: ResolvedTenant, @Body(new ZodPipe(resetPasswordSchema)) body: z.output<typeof resetPasswordSchema>, @Req() req: Request) {
    await this.auth.resetPassword(tenant, body.token, body.password, meta(req, tenant));
    return { ok: true };
  }

  @Post('change-password')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @Throttle(authLimit())
  async changePassword(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(changePasswordSchema)) body: z.output<typeof changePasswordSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.changePassword(tenant, user, body.currentPassword, body.newPassword, meta(req, tenant));
    setAuthCookies(res, tokens);
    return { ok: true };
  }

  @Get('invites/:token')
  @Throttle(authLimit(2))
  previewInvite(@CurrentTenant() tenant: ResolvedTenant, @Param('token') token: string) {
    return this.auth.previewInvite(tenant, String(token).slice(0, 128));
  }

  @Post('accept-invite')
  @HttpCode(200)
  @Throttle(authLimit())
  async acceptInvite(
    @CurrentTenant() tenant: ResolvedTenant,
    @Body(new ZodPipe(acceptInviteSchema)) body: z.output<typeof acceptInviteSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.acceptInvite(tenant, body.token, body.name, body.password, meta(req, tenant));
    setAuthCookies(res, tokens);
    setCsrfCookie(res, randomToken());
    return { ok: true };
  }
}
