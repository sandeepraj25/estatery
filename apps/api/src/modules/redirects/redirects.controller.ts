import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { clientIp } from '../../common/client-ip.js';
import { CsrfGuard } from '../../common/csrf.guard.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { CurrentTenant, type ResolvedTenant } from '../../common/tenancy/tenant.context.js';
import { AuthGuard, CurrentUser, RequirePermission, type AuthContext } from '../auth/auth.guard.js';
import { RedirectsService } from './redirects.service.js';

const bulkSchema = z.object({ text: z.string().max(100_000), permanent: z.boolean().default(true) });

@Controller('v1/admin/redirects')
@UseGuards(AuthGuard, CsrfGuard)
@RequirePermission('content:write')
export class RedirectsController {
  constructor(private readonly redirects: RedirectsService) {}

  @Get()
  list(@CurrentTenant() t: ResolvedTenant) {
    return this.redirects.list(t.id);
  }

  @Post()
  create(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Body() b: unknown, @Req() req: Request) {
    return this.redirects.create(t.id, u, b, clientIp(req));
  }

  @Post('bulk')
  @HttpCode(200)
  bulk(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Body(new ZodPipe(bulkSchema)) b: z.output<typeof bulkSchema>, @Req() req: Request) {
    return this.redirects.bulk(t.id, u, b.text, b.permanent, clientIp(req));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('id') id: string, @Req() req: Request) {
    await this.redirects.remove(t.id, u, id, clientIp(req));
  }
}
