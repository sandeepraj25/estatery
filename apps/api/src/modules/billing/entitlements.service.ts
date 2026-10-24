import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import { computeAccess, initialBilling, PLANS, type Access, type BillingState, type BillingUsage, type Entitlements } from '@estatery/shared';

type Countable = 'listings' | 'seats' | 'customDomains';
type Feature = 'leadExport' | 'roundRobin' | 'removeBranding';

const NOUN: Record<Countable, [one: string, many: string, verb: string]> = {
  listings: ['live listing', 'live listings', 'publish more listings'],
  seats: ['team member', 'team members', 'invite more people'],
  customDomains: ['custom domain', 'custom domains', 'connect more domains'],
};
const FEATURE: Record<Feature, string> = {
  leadExport: 'Exporting leads',
  roundRobin: 'Sharing enquiries in turn',
  removeBranding: 'Hiding the “Powered by Estatery” line',
};

/** Normalises the stored subdocument (or its absence) into a BillingState. */
export function billingOf(tenant: { billing?: Partial<BillingState> | null; createdAt?: Date }): BillingState {
  const base = initialBilling(tenant.createdAt ? new Date(tenant.createdAt) : new Date());
  if (!tenant.billing) return base;
  const b = tenant.billing;
  return {
    plan: b.plan ?? null, interval: b.interval ?? null, status: b.status ?? 'none',
    trialEndsAt: b.trialEndsAt ?? base.trialEndsAt, paidThrough: b.paidThrough ?? null, cancelAtPeriodEnd: b.cancelAtPeriodEnd ?? false,
    haltedAt: b.haltedAt ?? null, compPlan: b.compPlan ?? null, compUntil: b.compUntil ?? null,
    scheduledPlan: b.scheduledPlan ?? null, scheduledInterval: b.scheduledInterval ?? null,
  };
}

/**
 * Plan limits, enforced on the server wherever something countable is added. Existing content is
 * never removed when a plan shrinks or lapses: the website stays online, only additions stop.
 */
@Injectable()
export class EntitlementsService {
  constructor(
    @InjectModel('Tenant') private readonly tenants: Model<any>,
    @InjectModel('Property') private readonly properties: Model<any>,
    @InjectModel('Membership') private readonly memberships: Model<any>,
    @InjectModel('Invite') private readonly invites: Model<any>,
    @InjectModel('Domain') private readonly domains: Model<any>,
  ) {}

  async billing(tenantId: Types.ObjectId) {
    const t = await this.tenants.findById(tenantId, { billing: 1, createdAt: 1 }).lean<any>();
    return billingOf(t ?? {});
  }

  async access(tenantId: Types.ObjectId): Promise<Access> {
    return computeAccess(await this.billing(tenantId));
  }

  async usage(tenantId: Types.ObjectId): Promise<BillingUsage> {
    const [listings, members, invites, customDomains] = await Promise.all([
      this.properties.countDocuments({ tenantId, status: 'published' }),
      this.memberships.countDocuments({ tenantId, status: 'active' }),
      this.invites.countDocuments({ tenantId, acceptedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } }),
      this.domains.countDocuments({ tenantId, kind: 'custom' }),
    ]);
    return { listings, seats: members + invites, customDomains };
  }

  /** Throws 403 PLAN_LIMIT when adding `adding` more would exceed the current plan. */
  async assertCanAdd(tenantId: Types.ObjectId, what: Countable, adding = 1) {
    const access = await this.access(tenantId);
    const limit = access.entitlements[what];
    if (limit === null) return;
    const used = (await this.usage(tenantId))[what];
    if (used + adding <= limit) return;
    const [one, many, verb] = NOUN[what];
    if (access.state === 'restricted') {
      throw new ForbiddenException({
        code: 'PLAN_INACTIVE',
        message: `Your subscription isn’t active, so you can’t ${verb}. Your website stays online. The account owner can choose a plan under Billing.`,
      });
    }
    const planName = access.plan ? PLANS[access.plan].name : '';
    const label = access.source === 'trial' ? `Your free trial includes` : `The ${planName} plan includes`;
    throw new ForbiddenException({
      code: 'PLAN_LIMIT',
      message: `${label} ${limit} ${limit === 1 ? one : many} and you’re using ${used}. ${what === 'listings' ? 'Unpublish one or upgrade' : what === 'seats' ? 'Remove someone or upgrade' : 'Remove one or upgrade'} under Billing.`,
      limit, used,
    });
  }

  async has(tenantId: Types.ObjectId, feature: Feature) {
    return (await this.access(tenantId)).entitlements[feature];
  }

  async assertFeature(tenantId: Types.ObjectId, feature: Feature) {
    const access = await this.access(tenantId);
    if (access.entitlements[feature]) return;
    throw new ForbiddenException({
      code: access.state === 'restricted' ? 'PLAN_INACTIVE' : 'PLAN_FEATURE',
      message: access.state === 'restricted'
        ? `${FEATURE[feature]} needs an active subscription. The account owner can choose a plan under Billing.`
        : `${FEATURE[feature]} isn’t included in the ${access.plan ? PLANS[access.plan].name : 'current'} plan. Upgrade under Billing to turn it on.`,
    });
  }

  entitlementsFor(tenant: { billing?: Partial<BillingState> | null; createdAt?: Date }): Entitlements {
    return computeAccess(billingOf(tenant)).entitlements;
  }
}
