import { Controller, Get, Param, Query } from '@nestjs/common';
import { propertyQuerySchema, type PropertyQuery } from '@estatery/shared';
import { z } from 'zod';
import { ZodPipe } from '../../common/zod.pipe.js';
import { CurrentTenant, type ResolvedTenant } from '../../common/tenancy/tenant.context.js';
import { MovedError, PropertiesService } from './properties.service.js';

const slugSchema = z.string().regex(/^[a-z0-9-]{3,120}$/i, 'Invalid property URL');

@Controller('v1/properties')
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  /** GET /v1/properties?city=Mumbai&listingType=sale&minPrice=…&sort=price-asc&page=2 */
  @Get()
  search(@CurrentTenant() tenant: ResolvedTenant, @Query(new ZodPipe(propertyQuerySchema)) query: PropertyQuery) {
    return this.properties.search(tenant.id, query);
  }

  @Get(':slug')
  async detail(@CurrentTenant() tenant: ResolvedTenant, @Param('slug', new ZodPipe(slugSchema)) slug: string) {
    try {
      const [property, similar] = await Promise.all([
        this.properties.findBySlug(tenant.id, slug),
        this.properties.similar(tenant.id, slug),
      ]);
      return { property, similar };
    } catch (e) {
      if (e instanceof MovedError) return { redirectTo: e.slug };
      throw e;
    }
  }
}
