import { Controller, ForbiddenException, Get, Headers, Module, ServiceUnavailableException, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { InjectConnection, MongooseModule } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { QueueService } from './modules/jobs/queue.service.js';
import { ThrottlerModule } from '@nestjs/throttler';
import { Redis } from 'ioredis';
import { RedisThrottlerStorage } from './common/redis-throttler.storage.js';
import { isServerless, loadEnv } from './config/env.js';
import { safeEqualStr } from './modules/auth/tokens.service.js';
import { DomainRecheckService } from './modules/domains/domain-recheck.service.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { RedirectsModule } from './modules/redirects/redirects.module.js';
import { CrmModule } from './modules/crm/crm.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { DomainsModule } from './modules/domains/domains.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { LeadsModule } from './modules/leads/leads.module.js';
import { ModelsModule } from './modules/models.module.js';
import { PropertiesModule } from './modules/properties/properties.module.js';
import { SiteModule } from './modules/site/site.module.js';
import { TenantResolverMiddleware } from './modules/tenants/tenant-resolver.middleware.js';
import { TenantsModule } from './modules/tenants/tenants.module.js';

@Controller('health')
class HealthController {
  constructor(@InjectConnection() private readonly db: Connection, private readonly queue: QueueService) {}

  /** Liveness: the process is up. */
  @Get()
  health() {
    return { ok: true, version: loadEnv().APP_VERSION };
  }

  /** Readiness: dependencies answer. 503 tells the load balancer to stop sending traffic here. */
  @Get('ready')
  async ready() {
    let database = false;
    try {
      database = this.db.readyState === 1 && !!(await this.db.db?.admin().ping());
    } catch {
      database = false;
    }
    const body = { ok: database, database, jobs: this.queue.mode, version: loadEnv().APP_VERSION };
    if (!database) throw new ServiceUnavailableException({ code: 'NOT_READY', message: 'Database unavailable', ...body });
    return body;
  }
}

/**
 * Periodic work for serverless deployments (Vercel Cron calls this; see apps/api/vercel/build.mjs).
 * Runs the repeatable jobs and the custom-domain re-check once. Each job leases its own work items,
 * so overlapping runs are safe.
 */
@Controller('internal/cron')
class CronController {
  constructor(private readonly queue: QueueService, private readonly domains: DomainRecheckService) {}

  @Get()
  async run(@Headers('authorization') auth?: string) {
    const secret = loadEnv().CRON_SECRET;
    if (!secret || !auth || !safeEqualStr(auth, `Bearer ${secret}`)) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' });
    const jobs = await this.queue.runRepeatables();
    const domains = loadEnv().DOMAIN_RECHECK_MINUTES > 0 ? await this.domains.tick() : null;
    return { ok: true, jobs, domains };
  }
}

@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: loadEnv().MONGODB_URI,
        autoIndex: true,
        // Serverless: fail fast instead of retrying for minutes inside one request; the next request retries.
        ...(isServerless ? { serverSelectionTimeoutMS: 8_000, retryAttempts: 1, retryDelay: 500, maxPoolSize: 10 } : {}),
      }),
    }),
    // Rate limits are shared through Redis when it's configured, otherwise kept in memory.
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const url = loadEnv().REDIS_URL;
        return {
          throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
          ...(url ? { storage: new RedisThrottlerStorage(new Redis(url, { maxRetriesPerRequest: 2 })) } : {}),
        };
      },
    }),
    TenantsModule,
    ModelsModule,
    PropertiesModule,
    SiteModule,
    LeadsModule,
    AuthModule,
    AdminModule,
    MediaModule,
    DomainsModule,
    JobsModule,
    CrmModule,
    BillingModule,
    RedirectsModule,
  ],
  controllers: [HealthController, CronController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Every versioned route is tenant-scoped. /health is not.
    consumer.apply(TenantResolverMiddleware).forRoutes('v1/*path');
  }
}
