import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { addDomainSchema } from '@estatery/shared';
import { clientIp } from '../../common/client-ip.js';
import { CsrfGuard } from '../../common/csrf.guard.js';
import { TenantAwareThrottlerGuard } from '../../common/throttler.guard.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { CurrentTenant, type ResolvedTenant } from '../../common/tenancy/tenant.context.js';
import { loadEnv } from '../../config/env.js';
import { AuthGuard, CurrentUser, RequirePermission, type AuthContext } from '../auth/auth.guard.js';
import { safeEqualStr } from '../auth/tokens.service.js';
import { DomainsService } from './domains.service.js';

const domainLimit = (factor = 1) => ({ default: { limit: () => Math.max(1, Math.ceil(loadEnv().DOMAIN_RATE_LIMIT_PER_MIN * factor)), ttl: 60_000 } });
const requestHost = (req: Request, t: ResolvedTenant) => req.header('x-tenant-host') ?? req.header('host') ?? t.hostname;

@Controller('v1/admin/domains')
@UseGuards(AuthGuard, CsrfGuard, TenantAwareThrottlerGuard)
@RequirePermission('domains:manage')
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  @Get()
  async list(@CurrentTenant() t: ResolvedTenant) {
    return { items: await this.domains.list(t.id) };
  }

  @Post()
  @HttpCode(201)
  @Throttle(domainLimit())
  add(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Body(new ZodPipe(addDomainSchema)) b: { hostname: string }, @Req() req: Request) {
    return this.domains.add(t, u, b.hostname, clientIp(req));
  }

  /** Runs live DNS lookups, so it's rate limited. */
  @Post(':id/verify')
  @HttpCode(200)
  @Throttle(domainLimit(1.2))
  verify(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('id') id: string, @Req() req: Request) {
    return this.domains.verify(t, u, id, clientIp(req));
  }

  @Post(':id/primary')
  @HttpCode(200)
  async primary(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('id') id: string, @Req() req: Request) {
    return { items: await this.domains.setPrimary(t, u, id, clientIp(req)) };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('id') id: string, @Req() req: Request) {
    await this.domains.remove(t, u, id, clientIp(req), requestHost(req, t));
  }
}

/** Public, tenant-resolved: tells the web server whether to redirect to the main domain. */
@Controller('v1/site/routing')
export class RoutingController {
  constructor(private readonly domains: DomainsService) {}

  @Get()
  routing(@CurrentTenant() t: ResolvedTenant) {
    return this.domains.routingFor(t.id, t.hostname);
  }
}

/**
 * Caddy on-demand TLS "ask" endpoint (not tenant-scoped):
 *   on_demand_tls { ask http://api:4000/internal/tls/ask?token=<TLS_ASK_TOKEN> }
 * Caddy appends &domain=<hostname>. 200 = issue a certificate, anything else = refuse.
 */
@Controller('internal/tls')
export class TlsAskController {
  constructor(private readonly domains: DomainsService) {}

  @Get('ask')
  async ask(@Query('domain') domain: string | undefined, @Query('token') token: string | undefined) {
    const expected = loadEnv().TLS_ASK_TOKEN;
    if (!expected || !token || !safeEqualStr(token, expected) || !domain || domain.length > 253) throw new NotFoundException();
    if (!(await this.domains.allowCertificate(domain))) throw new NotFoundException();
    return { ok: true };
  }
}
