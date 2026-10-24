import { BadRequestException, Body, ForbiddenException, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { inviteSchema, TENANT_ROLES, createAgencySchema, type CreateAgencyInput } from '@estatery/shared';
import { clientIp } from '../../common/client-ip.js';
import { CsrfGuard } from '../../common/csrf.guard.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { CurrentTenant, type ResolvedTenant } from '../../common/tenancy/tenant.context.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthGuard, CurrentUser, PlatformOnly, RequirePermission, type AuthContext } from '../auth/auth.guard.js';
import { AdminService, adminPropertyQuery, auditQuery } from './admin.service.js';
import { PlatformService } from './platform.service.js';
import { TeamService } from './team.service.js';

const HOST = /^[a-z0-9.-]{1,253}(:\d{1,5})?$/i;
const hostOf = (req: Request, tenant: ResolvedTenant) => {
  const h = req.header('x-tenant-host') ?? req.header('host');
  return h && HOST.test(h) ? h : tenant.hostname;
};

const updateMember = z
  .object({
    role: z.enum(TENANT_ROLES).optional(),
    status: z.enum(['active', 'deactivated']).optional(),
    agentId: z.string().regex(/^[a-f0-9]{24}$/).nullable().optional(),
  })
  .refine((v) => v.role !== undefined || v.status !== undefined || v.agentId !== undefined, 'Nothing to update');

/** Tenant admin endpoints. Every route: signed in, CSRF-checked, permission-checked. */
@Controller('v1/admin')
@UseGuards(AuthGuard, CsrfGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly team: TeamService,
    private readonly audit: AuditService,
  ) {}

  @Get('dashboard')
  @RequirePermission('dashboard:view')
  dashboard(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext) {
    return this.admin.dashboard(t.id, u);
  }

  @Get('properties')
  @RequirePermission('properties:read')
  properties(@CurrentTenant() t: ResolvedTenant, @Query(new ZodPipe(adminPropertyQuery)) q: z.output<typeof adminPropertyQuery>) {
    return this.admin.listProperties(t.id, q);
  }

  @Get('team')
  @RequirePermission('team:read')
  teamList(@CurrentTenant() t: ResolvedTenant) {
    return this.team.list(t.id);
  }

  @Post('team/invites')
  @HttpCode(201)
  @RequirePermission('team:manage')
  invite(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Body(new ZodPipe(inviteSchema)) body: z.output<typeof inviteSchema>, @Req() req: Request) {
    return this.team.invite(t, u, body.email, body.role, hostOf(req, t), clientIp(req));
  }

  @Delete('team/invites/:id')
  @HttpCode(204)
  @RequirePermission('team:manage')
  async revokeInvite(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('id') id: string, @Req() req: Request) {
    await this.team.revokeInvite(t, u, id, clientIp(req));
  }

  @Patch('team/members/:id')
  @RequirePermission('team:manage')
  async updateMember(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('id') id: string, @Body(new ZodPipe(updateMember)) body: z.output<typeof updateMember>, @Req() req: Request) {
    await this.team.updateMember(t, u, id, body, clientIp(req));
    return { ok: true };
  }

  @Get('audit')
  @RequirePermission('audit:read')
  auditLog(@CurrentTenant() t: ResolvedTenant, @Query(new ZodPipe(auditQuery)) q: z.output<typeof auditQuery>) {
    return this.audit.list(t.id, q.page, q.limit);
  }
}

/** Platform-operator endpoints: same Admin Panel, separate role check. */
@Controller('v1/platform')
@UseGuards(AuthGuard, CsrfGuard)
@PlatformOnly()
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('tenants')
  tenants() {
    return this.platform.listTenants();
  }

  @Post('tenants')
  createTenant(@CurrentUser() u: AuthContext, @Body(new ZodPipe(createAgencySchema)) b: CreateAgencyInput, @Req() req: Request) {
    return this.platform.createTenant(u, b, clientIp(req));
  }

  @Patch('tenants/:id/status')
  setStatus(
    @CurrentTenant() t: ResolvedTenant,
    @CurrentUser() u: AuthContext,
    @Param('id') id: string,
    @Body(new ZodPipe(z.object({ status: z.enum(['active', 'suspended']) }))) body: { status: 'active' | 'suspended' },
    @Req() req: Request,
  ) {
    if (id === t.id.toString() && body.status === 'suspended') {
      throw new BadRequestException({ code: 'SELF_SUSPEND', message: 'You can’t suspend the site you’re signed in to.' });
    }
    return this.platform.setStatus(u, id, body.status, clientIp(req));
  }
}
