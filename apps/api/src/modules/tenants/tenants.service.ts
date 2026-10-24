import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { siteSettingsSchema, type SiteSettings } from '@estatery/shared';
import { loadEnv } from '../../config/env.js';
import type { ResolvedTenant } from '../../common/tenancy/tenant.context.js';
import { normaliseHost } from './hostname.js';
import type { DomainDoc, TenantDoc } from './tenant.schemas.js';

interface CacheEntry {
  value: ResolvedTenant | null;
  expires: number;
}

@Injectable()
export class TenantsService {
  /** Small in-process cache: hostname lookups happen on every request. Swap for Redis when scaling out. */
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttl = loadEnv().TENANT_CACHE_TTL_MS;

  constructor(
    @InjectModel('Tenant') private readonly tenants: Model<TenantDoc>,
    @InjectModel('Domain') private readonly domains: Model<DomainDoc>,
  ) {}

  async resolveHost(rawHost: string | undefined): Promise<ResolvedTenant> {
    const hostname = normaliseHost(rawHost);
    if (!hostname) throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: 'Unknown site.' });

    const hit = this.cache.get(hostname);
    let tenant: ResolvedTenant | null;
    if (hit && hit.expires > Date.now()) {
      tenant = hit.value;
    } else {
      tenant = await this.lookup(hostname);
      this.cache.set(hostname, { value: tenant, expires: Date.now() + this.ttl });
      if (this.cache.size > 5000) this.cache.delete(this.cache.keys().next().value!);
    }

    if (!tenant) throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: 'Unknown site.' });
    if (tenant.status === 'suspended') {
      throw new ForbiddenException({ code: 'TENANT_SUSPENDED', message: 'This site is temporarily unavailable.' });
    }
    return tenant;
  }

  private async lookup(hostname: string): Promise<ResolvedTenant | null> {
    // Only verified domains route traffic; an unverified custom domain can't hijack a tenant.
    const domain = await this.domains.findOne({ hostname, verified: true }).lean();
    if (!domain) return null;
    const t = await this.tenants.findById(domain.tenantId).lean();
    if (!t) return null;
    return { id: t._id, slug: t.slug, name: t.name, status: t.status as ResolvedTenant['status'], hostname };
  }

  async getSettings(tenantId: ResolvedTenant['id']): Promise<SiteSettings> {
    const t = await this.tenants.findById(tenantId, { settings: 1 }).lean();
    if (!t) throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: 'Unknown site.' });
    return siteSettingsSchema.parse(t.settings);
  }

  invalidate(hostname?: string) {
    if (hostname) this.cache.delete(hostname);
    else this.cache.clear();
  }
}
