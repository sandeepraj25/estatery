import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { isServerless, loadEnv } from '../../config/env.js';
import type { DomainDoc } from '../tenants/tenant.schemas.js';
import { DomainsService } from './domains.service.js';

/**
 * Background domain maintenance:
 *  - re-checks verified custom domains (DNS + HTTPS) and stops routing ones that are lost;
 *  - releases lapsed unverified claims.
 * Each domain is leased by atomically bumping lastCheckedAt before it's checked, so running
 * several API instances doesn't double-check. (Move to a BullMQ repeatable job when Redis is added.)
 */
@Injectable()
export class DomainRecheckService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('DomainRecheck');
  private readonly env = loadEnv();
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectModel('Domain') private readonly domains: Model<DomainDoc>,
    private readonly svc: DomainsService,
  ) {}

  onApplicationBootstrap() {
    // Serverless: no timers; Vercel Cron calls tick() through /internal/cron instead.
    if (this.env.DOMAIN_RECHECK_MINUTES === 0 || this.env.NODE_ENV === 'test' || isServerless) return;
    this.timer = setInterval(() => void this.tick(), 5 * 60_000);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass. Public so it can be triggered by tests or an external scheduler. */
  async tick(limit = 50) {
    if (this.running) return { checked: 0, lost: 0, released: 0 };
    this.running = true;
    let checked = 0;
    let lost = 0;
    try {
      const released = await this.domains.deleteMany({ kind: 'custom', verified: false, status: { $ne: 'lost' }, claimExpiresAt: { $lt: new Date() } });
      const staleBefore = new Date(Date.now() - this.env.DOMAIN_RECHECK_MINUTES * 60_000);
      for (let i = 0; i < limit; i++) {
        const leased = await this.domains
          .findOneAndUpdate(
            { kind: 'custom', verified: true, $or: [{ lastCheckedAt: null }, { lastCheckedAt: { $lt: staleBefore } }] },
            { $set: { lastCheckedAt: new Date() } },
          )
          .lean<DomainDoc>();
        if (!leased) break;
        checked++;
        if ((await this.svc.recheck(leased)) === 'lost') lost++;
      }
      if (checked || released.deletedCount) this.logger.log(`Checked ${checked} domains, ${lost} lost, released ${released.deletedCount} lapsed claims`);
      return { checked, lost, released: released.deletedCount };
    } catch (e) {
      this.logger.error(`Domain re-check failed: ${(e as Error).message}`);
      return { checked, lost, released: 0 };
    } finally {
      this.running = false;
    }
  }
}
