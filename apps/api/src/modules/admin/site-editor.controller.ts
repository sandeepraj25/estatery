import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { can, PAGE_KEYS, type PageKey } from '@estatery/shared';
import { clientIp } from '../../common/client-ip.js';
import { CsrfGuard } from '../../common/csrf.guard.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { CurrentTenant, type ResolvedTenant } from '../../common/tenancy/tenant.context.js';
import { AuthGuard, CurrentUser, RequirePermission, type AuthContext } from '../auth/auth.guard.js';
import { SiteService } from '../site/site.service.js';
import { isLibraryKind, LibraryService, type LibraryKind } from './library.service.js';
import { SiteEditorService } from './site-editor.service.js';

const saveSchema = z.object({ value: z.unknown(), baseRevision: z.number().int().min(0) });
const PARTS = ['settings', 'theme', 'homepage', 'pages'] as const;

function requireEditor(u: AuthContext) {
  if (!can(u.role, 'content:write') && !can(u.role, 'branding:write')) {
    throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Your role can’t edit the website.' });
  }
}

@Controller('v1/admin/site')
@UseGuards(AuthGuard, CsrfGuard)
export class SiteEditorController {
  constructor(
    private readonly editor: SiteEditorService,
    private readonly site: SiteService,
  ) {}

  @Get('draft')
  draft(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext) {
    requireEditor(u);
    return this.editor.getDraft(t.id);
  }

  @Put('draft/:part')
  save(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('part') part: string, @Body(new ZodPipe(saveSchema)) b: z.output<typeof saveSchema>) {
    if (!(PARTS as readonly string[]).includes(part)) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Unknown section.' });
    return this.editor.saveDraft(t.id, u, part as (typeof PARTS)[number], b.value, b.baseRevision);
  }

  /** Draft config + homepage data for the preview iframe. Never served to visitors. */
  @Get('preview')
  async preview(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext) {
    requireEditor(u);
    return this.editor.getDraftConfig(t);
  }

  @Get('preview/home')
  async previewHome(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext) {
    requireEditor(u);
    return this.site.getHomeBundle(t, await this.editor.getDraftConfig(t));
  }

  @Get('preview/pages/:key')
  previewPage(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('key', new ZodPipe(z.enum(PAGE_KEYS))) key: PageKey) {
    requireEditor(u);
    return this.editor.getDraftPage(t.id, key);
  }

  @Post('publish')
  @HttpCode(200)
  publish(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Body(new ZodPipe(z.object({ note: z.string().trim().max(200).default('') }))) b: { note: string }, @Req() req: Request) {
    requireEditor(u);
    return this.editor.publish(t, u, b.note, clientIp(req));
  }

  @Post('discard')
  @HttpCode(204)
  async discard(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Req() req: Request) {
    requireEditor(u);
    await this.editor.discard(t.id, u, clientIp(req));
  }

  @Get('versions')
  versions(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext) {
    requireEditor(u);
    return this.editor.listVersions(t.id);
  }

  @Post('versions/:version/restore')
  @HttpCode(204)
  async restore(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('version') v: string, @Req() req: Request) {
    const version = Number(v);
    if (!Number.isInteger(version) || version < 1) throw new BadRequestException({ code: 'NOT_FOUND', message: 'That version doesn’t exist.' });
    await this.editor.restore(t.id, u, version, clientIp(req));
  }

  @Get('defaults')
  async defaults(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext) {
    requireEditor(u);
    const d = await this.editor.getDraft(t.id);
    return this.editor.defaults(d.draft.settings);
  }
}

@Controller('v1/admin/library')
@UseGuards(AuthGuard, CsrfGuard)
export class LibraryController {
  constructor(private readonly lib: LibraryService) {}

  private kind(k: string): LibraryKind {
    if (!isLibraryKind(k)) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Unknown content type.' });
    return k;
  }

  @Get(':kind')
  @RequirePermission('properties:read')
  list(@CurrentTenant() t: ResolvedTenant, @Param('kind') k: string) {
    return this.lib.list(t.id, this.kind(k));
  }

  @Post(':kind')
  @HttpCode(201)
  @RequirePermission('content:write')
  create(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('kind') k: string, @Body() body: unknown, @Req() req: Request) {
    return this.lib.create(t.id, u, this.kind(k), body, clientIp(req));
  }

  @Post(':kind/reorder')
  @HttpCode(200)
  @RequirePermission('content:write')
  reorder(@CurrentTenant() t: ResolvedTenant, @Param('kind') k: string, @Body(new ZodPipe(z.object({ ids: z.array(z.string()).min(1).max(200) }))) b: { ids: string[] }) {
    return this.lib.reorder(t.id, this.kind(k), b.ids);
  }

  @Put(':kind/:id')
  @RequirePermission('content:write')
  update(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('kind') k: string, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.lib.update(t.id, u, this.kind(k), id, body, clientIp(req));
  }

  @Delete(':kind/:id')
  @HttpCode(204)
  @RequirePermission('content:write')
  async remove(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('kind') k: string, @Param('id') id: string, @Req() req: Request) {
    await this.lib.remove(t.id, u, this.kind(k), id, clientIp(req));
  }
}
