import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { articleInputSchema, type ArticleInput } from '@estatery/shared';
import { clientIp } from '../../common/client-ip.js';
import { CsrfGuard } from '../../common/csrf.guard.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { CurrentTenant, type ResolvedTenant } from '../../common/tenancy/tenant.context.js';
import { AuthGuard, CurrentUser, RequirePermission, type AuthContext } from '../auth/auth.guard.js';
import { articleListQuery, ArticlesAdminService, type ArticleListQuery } from './articles-admin.service.js';

@Controller('v1/admin/articles')
@UseGuards(AuthGuard, CsrfGuard)
@RequirePermission('content:write')
export class ArticlesAdminController {
  constructor(private readonly articles: ArticlesAdminService) {}

  @Get()
  list(@CurrentTenant() t: ResolvedTenant, @Query(new ZodPipe(articleListQuery)) q: ArticleListQuery) {
    return this.articles.list(t.id, q);
  }

  @Get(':id')
  get(@CurrentTenant() t: ResolvedTenant, @Param('id') id: string) {
    return this.articles.get(t.id, id);
  }

  @Post()
  create(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Body(new ZodPipe(articleInputSchema)) b: ArticleInput, @Req() req: Request) {
    return this.articles.create(t.id, u, b, clientIp(req));
  }

  @Put(':id')
  update(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('id') id: string, @Body(new ZodPipe(articleInputSchema)) b: ArticleInput, @Req() req: Request) {
    return this.articles.update(t.id, u, id, b, clientIp(req));
  }

  @Post(':id/status')
  @HttpCode(200)
  status(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('id') id: string, @Body(new ZodPipe(z.object({ status: z.enum(['draft', 'published']) }))) b: { status: 'draft' | 'published' }, @Req() req: Request) {
    return this.articles.setStatus(t.id, u, id, b.status, clientIp(req));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('id') id: string, @Req() req: Request) {
    await this.articles.remove(t.id, u, id, clientIp(req));
  }
}
