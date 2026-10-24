import type { Schema } from 'mongoose';

/**
 * Defence-in-depth for multi-tenancy.
 *
 * Services always pass `tenantId` explicitly, but a single forgotten filter would leak one
 * agency's listings or leads to another. This plugin makes that mistake impossible to ship:
 * any query, update, delete or aggregation on a tenant-owned collection that is not scoped by
 * `tenantId` throws before it reaches the database.
 *
 * Platform-level jobs that genuinely need to cross tenants (e.g. billing reconciliation) must
 * opt out explicitly per query with `.setOptions({ crossTenant: true })`, which is easy to audit.
 */
export class TenantScopeViolation extends Error {
  constructor(op: string, model: string) {
    super(`Unscoped ${op} on tenant-owned collection "${model}". Add a tenantId filter.`);
    this.name = 'TenantScopeViolation';
  }
}

const QUERY_OPS = [
  'find',
  'findOne',
  'countDocuments',
  'updateOne',
  'updateMany',
  'deleteOne',
  'deleteMany',
  'findOneAndUpdate',
  'findOneAndDelete',
  'replaceOne',
  'distinct',
] as const;

export function tenantScopePlugin(schema: Schema) {
  for (const op of QUERY_OPS) {
    schema.pre(op, function () {
      // `this` is a mongoose Query here.
      const q = this as unknown as {
        getFilter(): Record<string, unknown>;
        getOptions(): Record<string, unknown>;
        model: { modelName: string };
      };
      if (q.getOptions().crossTenant === true) return;
      const filter = q.getFilter();
      if (filter.tenantId === undefined || filter.tenantId === null) {
        throw new TenantScopeViolation(op, q.model.modelName);
      }
    });
  }

  schema.pre('aggregate', function () {
    const agg = this as unknown as {
      pipeline(): Array<Record<string, any>>;
      options: Record<string, unknown>;
      _model?: { modelName: string };
    };
    if (agg.options?.crossTenant === true) return;
    const first = agg.pipeline()[0];
    if (!first?.$match || first.$match.tenantId === undefined) {
      throw new TenantScopeViolation('aggregate', agg._model?.modelName ?? 'unknown');
    }
  });

  schema.pre('save', function () {
    const doc = this as unknown as { tenantId?: unknown; constructor: { modelName: string } };
    if (!doc.tenantId) throw new TenantScopeViolation('save', doc.constructor.modelName);
  });

  // Mongoose 9 passes the documents as the first argument (no `next` callback).
  (schema as any).pre('insertMany', function (docs: Array<{ tenantId?: unknown }>) {
    const list = Array.isArray(docs) ? docs : [docs];
    if (list.some((d) => !d?.tenantId)) throw new TenantScopeViolation('insertMany', 'unknown');
  });
}
