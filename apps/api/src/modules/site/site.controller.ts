import { Controller, Get, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { PAGE_KEYS, type PageKey } from '@estatery/shared';
import { ZodPipe } from '../../common/zod.pipe.js';
import { CurrentTenant, type ResolvedTenant } from '../../common/tenancy/tenant.context.js';
import { SiteService } from './site.service.js';

const articleQuery = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
  category: z.string().trim().max(40).optional(),
});

@Controller('v1/site')
export class SiteController {
  constructor(private readonly site: SiteService) {}

  @Get()
  config(@CurrentTenant() tenant: ResolvedTenant) {
    return this.site.getConfig(tenant);
  }

  @Get('home')
  home(@CurrentTenant() tenant: ResolvedTenant) {
    return this.site.getHomeBundle(tenant);
  }

  @Get('cities')
  async cities(@CurrentTenant() tenant: ResolvedTenant) {
    return { items: await this.site.getCities(tenant.id) };
  }

  @Get('articles')
  articles(@CurrentTenant() tenant: ResolvedTenant, @Query(new ZodPipe(articleQuery)) q: z.output<typeof articleQuery>) {
    return this.site.listArticles(tenant.id, q);
  }

  @Get('pages/:key')
  page(@CurrentTenant() tenant: ResolvedTenant, @Param('key', new ZodPipe(z.enum(PAGE_KEYS))) key: PageKey) {
    return this.site.getPage(tenant.id, key);
  }

  @Get('sitemap')
  async sitemap(@CurrentTenant() tenant: ResolvedTenant) {
    return { items: await this.site.sitemap(tenant.id) };
  }

  @Get('articles/:slug')
  article(@CurrentTenant() tenant: ResolvedTenant, @Param('slug', new ZodPipe(z.string().regex(/^[a-z0-9-]{3,120}$/))) slug: string) {
    return this.site.getArticle(tenant.id, slug);
  }

  @Get('projects')
  async projects(@CurrentTenant() tenant: ResolvedTenant) {
    return { items: await this.site.getProjects(tenant.id) };
  }
}
