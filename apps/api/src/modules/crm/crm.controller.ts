import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';
import {
  crmSettingsSchema, leadAssignSchema, leadNoteSchema, leadStatusChangeSchema, reminderCreateSchema, reminderUpdateSchema, type CrmSettings,
} from '@estatery/shared';
import { clientIp } from '../../common/client-ip.js';
import { CsrfGuard } from '../../common/csrf.guard.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { CurrentTenant, type ResolvedTenant } from '../../common/tenancy/tenant.context.js';
import { AuthGuard, CurrentUser, RequirePermission, type AuthContext } from '../auth/auth.guard.js';
import { MailService } from '../mail/mail.service.js';
import { CrmService, leadListQuery, type LeadListQuery } from './crm.service.js';

/** Lead management. Visibility and write rules are enforced in CrmService for every call. */
@Controller('v1/admin/leads')
@UseGuards(AuthGuard, CsrfGuard)
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get()
  list(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Query(new ZodPipe(leadListQuery)) q: LeadListQuery) {
    return this.crm.list(t.id, u, q);
  }

  @Get('board')
  board(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Query('agent') agent?: string) {
    return this.crm.board(t.id, u, agent);
  }

  @Get('export.csv')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="leads.csv"')
  export(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Query(new ZodPipe(leadListQuery)) q: LeadListQuery, @Req() req: Request) {
    return this.crm.exportCsv(t.id, u, q, clientIp(req));
  }

  @Get('reminders/mine')
  mine(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext) {
    return this.crm.myReminders(t.id, u);
  }

  @Patch('reminders/:rid')
  updateReminder(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('rid') rid: string, @Body(new ZodPipe(reminderUpdateSchema)) b: { done: boolean }) {
    return this.crm.updateReminder(t.id, u, rid, b.done);
  }

  @Get(':id')
  detail(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('id') id: string) {
    return this.crm.detail(t.id, u, id);
  }

  @Post(':id/status')
  @HttpCode(200)
  status(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('id') id: string, @Body(new ZodPipe(leadStatusChangeSchema)) b: z.output<typeof leadStatusChangeSchema>) {
    return this.crm.setStatus(t.id, u, id, b.status, b.note);
  }

  @Post(':id/assign')
  @HttpCode(200)
  assign(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('id') id: string, @Body(new ZodPipe(leadAssignSchema)) b: { agentId: string | null }) {
    return this.crm.assign(t.id, u, id, b.agentId);
  }

  @Post(':id/notes')
  @HttpCode(201)
  note(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('id') id: string, @Body(new ZodPipe(leadNoteSchema)) b: z.output<typeof leadNoteSchema>) {
    return this.crm.addNote(t.id, u, id, b.body, b.kind);
  }

  @Post(':id/reminders')
  @HttpCode(201)
  reminder(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('id') id: string, @Body(new ZodPipe(reminderCreateSchema)) b: z.output<typeof reminderCreateSchema>) {
    return this.crm.addReminder(t.id, u, id, b);
  }

  @Delete(':id')
  @HttpCode(204)
  async erase(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('id') id: string, @Req() req: Request) {
    await this.crm.erase(t.id, u, id, clientIp(req));
  }
}

@Controller('v1/admin/crm/settings')
@UseGuards(AuthGuard, CsrfGuard)
@RequirePermission('team:manage')
export class CrmSettingsController {
  constructor(private readonly crm: CrmService, private readonly mail: MailService) {}

  @Get()
  get(@CurrentTenant() t: ResolvedTenant) {
    return this.crm.getSettings(t.id);
  }

  /** Lets the settings page warn when SMTP isn't configured (notifications would not be delivered). */
  @Get('email-status')
  emailStatus() {
    return { configured: this.mail.configured };
  }

  @Put()
  save(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Body(new ZodPipe(crmSettingsSchema)) b: CrmSettings, @Req() req: Request) {
    return this.crm.saveSettings(t.id, u, b, clientIp(req));
  }
}
