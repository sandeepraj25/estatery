import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, type Model, type Types } from 'mongoose';
import { normalizeRedirectPath, redirectInputSchema, type RedirectRule } from '@estatery/shared';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.guard.js';

const MAX_PER_TENANT = 1000;

@Injectable()
export class RedirectsService {
  constructor(
    @InjectModel('Redirect') private readonly redirects: Model<any>,
    @InjectModel('Property') private readonly properties: Model<any>,
    @InjectModel('Article') private readonly articles: Model<any>,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: Types.ObjectId) {
    const docs = await this.redirects.find({ tenantId }).sort({ from: 1 }).lean<any[]>();
    return { items: docs.map((d) => ({ id: d._id.toString(), from: d.from as string, to: d.to as string, permanent: d.permanent as boolean, createdAt: new Date(d.createdAt).toISOString() })), max: MAX_PER_TENANT };
  }

  /** Rules for the web server's proxy (cached there per hostname). */
  async rules(tenantId: Types.ObjectId): Promise<RedirectRule[]> {
    const docs = await this.redirects.find({ tenantId }, { from: 1, to: 1, permanent: 1 }).limit(MAX_PER_TENANT).lean<any[]>();
    return docs.map((d) => ({ from: d.from, to: d.to, permanent: d.permanent }));
  }

  /** Checks one rule against the agency's live pages and other rules. Returns a reason, or null if fine. */
  private async problem(tenantId: Types.ObjectId, from: string, to: string, existing: Map<string, string>) {
    const target = to.startsWith('/') ? normalizeRedirectPath(to) : null;
    if (target === from) return 'It points to itself';
    if (target && existing.has(target)) return `${target} is itself redirected; point straight to the final page`;
    for (const [f, t] of existing) if (t.startsWith('/') && normalizeRedirectPath(t) === from && f !== from) return `${f} already redirects here, which would create a chain`;
    const m = /^\/(properties|insights)\/([a-z0-9-]+)$/.exec(from);
    if (m) {
      const live = m[1] === 'properties'
        ? await this.properties.exists({ tenantId, slug: m[2], status: { $in: ['published', 'sold', 'rented'] } })
        : await this.articles.exists({ tenantId, slug: m[2], status: 'published' });
      if (live) return `${from} is a live page on this website`;
    }
    return null;
  }

  async create(tenantId: Types.ObjectId, actor: AuthContext, raw: unknown, ip: string | null) {
    const parsed = redirectInputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Check the addresses.', fields: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    }
    const { from, to, permanent } = parsed.data;
    const all = await this.redirects.find({ tenantId }, { from: 1, to: 1 }).lean<any[]>();
    if (all.length >= MAX_PER_TENANT) throw new BadRequestException({ code: 'LIMIT', message: `You can have up to ${MAX_PER_TENANT} redirects.` });
    if (all.some((r) => r.from === from)) throw new ConflictException({ code: 'DUPLICATE', message: `${from} already has a redirect.`, fields: [{ path: 'from', message: 'Already redirected' }] });
    const reason = await this.problem(tenantId, from, to, new Map(all.map((r) => [r.from, r.to])));
    if (reason) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: reason, fields: [{ path: 'from', message: reason }] });
    const doc = await this.redirects.create({ tenantId, from, to, permanent, createdBy: actor.userId });
    await this.audit.record({ tenantId, actor: { id: actor.userId, name: actor.name }, action: 'redirect.created', targetType: 'redirect', targetId: doc._id.toString(), summary: `Redirect ${from} → ${to}`, ip });
    return { id: doc._id.toString(), from, to, permanent };
  }

  /**
   * Bulk add from pasted lines ("old-path new-path", separated by spaces, tabs or commas). Valid
   * lines are added; the rest are reported back with a reason, so a large migration list can be
   * fixed and re-pasted.
   */
  async bulk(tenantId: Types.ObjectId, actor: AuthContext, text: string, permanent: boolean, ip: string | null) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    if (lines.length > 500) throw new BadRequestException({ code: 'TOO_MANY', message: 'Paste at most 500 lines at a time.' });
    const all = await this.redirects.find({ tenantId }, { from: 1, to: 1 }).lean<any[]>();
    const existing = new Map<string, string>(all.map((r) => [r.from, r.to]));
    const added: Array<{ from: string; to: string }> = [];
    const errors: Array<{ line: number; text: string; reason: string }> = [];
    for (const [i, line] of lines.entries()) {
      const parts = line.split(/[\s,]+/).filter(Boolean);
      if (parts.length !== 2) {
        errors.push({ line: i + 1, text: line, reason: 'Use “old-address new-address”' });
        continue;
      }
      const parsed = redirectInputSchema.safeParse({ from: parts[0], to: parts[1], permanent });
      if (!parsed.success) {
        errors.push({ line: i + 1, text: line, reason: parsed.error.issues[0]!.message });
        continue;
      }
      const { from, to } = parsed.data;
      if (existing.has(from)) {
        errors.push({ line: i + 1, text: line, reason: 'Already redirected' });
        continue;
      }
      const reason = await this.problem(tenantId, from, to, existing);
      if (reason) {
        errors.push({ line: i + 1, text: line, reason });
        continue;
      }
      if (existing.size >= MAX_PER_TENANT) {
        errors.push({ line: i + 1, text: line, reason: `Limit of ${MAX_PER_TENANT} redirects reached` });
        continue;
      }
      existing.set(from, to);
      added.push({ from, to });
    }
    if (added.length) {
      await this.redirects.insertMany(added.map((a) => ({ tenantId, ...a, permanent, createdBy: actor.userId })));
      await this.audit.record({ tenantId, actor: { id: actor.userId, name: actor.name }, action: 'redirect.imported', summary: `Added ${added.length} redirects`, ip });
    }
    return { added: added.length, errors };
  }

  async remove(tenantId: Types.ObjectId, actor: AuthContext, id: string, ip: string | null) {
    if (!isValidObjectId(id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Redirect not found.' });
    const doc = await this.redirects.findOneAndDelete({ tenantId, _id: id }).lean<any>();
    if (!doc) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Redirect not found.' });
    await this.audit.record({ tenantId, actor: { id: actor.userId, name: actor.name }, action: 'redirect.deleted', summary: `Removed redirect ${doc.from} → ${doc.to}`, ip });
  }
}
