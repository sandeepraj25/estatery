import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { propertyInputSchema, propertyStatusChangeSchema, type PropertyInputParsed, type PropertyStatus } from '@estatery/shared';
import { clientIp } from '../../common/client-ip.js';
import { CsrfGuard } from '../../common/csrf.guard.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { CurrentTenant, type ResolvedTenant } from '../../common/tenancy/tenant.context.js';
import { AuthGuard, CurrentUser, RequirePermission, type AuthContext } from '../auth/auth.guard.js';
import { PropertyAdminService } from './property-admin.service.js';

const importSchema = z.object({ csv: z.string().min(1).max(2_000_000), dryRun: z.boolean().default(true) });

@Controller('v1/admin/properties')
@UseGuards(AuthGuard, CsrfGuard)
export class PropertyAdminController {
  constructor(private readonly svc: PropertyAdminService) {}

  @Get('export.csv')
  @RequirePermission('properties:read')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="listings.csv"')
  export(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Req() req: Request) {
    return this.svc.exportCsv(t.id, u, clientIp(req));
  }

  @Post('import')
  @HttpCode(200)
  @RequirePermission('properties:write')
  import(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Body(new ZodPipe(importSchema)) b: z.output<typeof importSchema>, @Req() req: Request) {
    return this.svc.importCsv(t.id, u, b.csv, b.dryRun, clientIp(req));
  }

  @Get(':id')
  @RequirePermission('properties:read')
  get(@CurrentTenant() t: ResolvedTenant, @Param('id') id: string) {
    return this.svc.get(t.id, id);
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('properties:write')
  create(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Body(new ZodPipe(propertyInputSchema)) b: PropertyInputParsed, @Req() req: Request) {
    return this.svc.create(t.id, u, b, clientIp(req));
  }

  @Put(':id')
  @RequirePermission('properties:write')
  update(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('id') id: string, @Body(new ZodPipe(propertyInputSchema)) b: PropertyInputParsed, @Req() req: Request) {
    return this.svc.update(t.id, u, id, b, clientIp(req));
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermission('properties:write')
  status(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('id') id: string, @Body(new ZodPipe(propertyStatusChangeSchema)) b: { status: PropertyStatus }, @Req() req: Request) {
    return this.svc.setStatus(t.id, u, id, b.status, clientIp(req));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('properties:write')
  async remove(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('id') id: string, @Req() req: Request) {
    await this.svc.remove(t.id, u, id, clientIp(req));
  }
}
