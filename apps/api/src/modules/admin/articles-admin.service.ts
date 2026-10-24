import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Types, type Model } from 'mongoose';
import { articlePublishProblems, readingMinutes, slugify, type ArticleInput, type ArticleStatus } from '@estatery/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.guard.js';
import { MediaService } from '../media/media.service.js';

export const articleListQuery = z.object({
  status: z.enum(['draft', 'published']).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
});
export type ArticleListQuery = z.output<typeof articleListQuery>;

const fieldError = (path: string, message: string) =>
  new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Some fields need attention.', fields: [{ path, message }] });
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Articles ("Insights") for the agency's blog. Editors write drafts; publishing checks completeness. */
@Injectable()
export class ArticlesAdminService {
  constructor(
    @InjectModel('Article') private readonly articles: Model<any>,
    @InjectModel('Agent') private readonly agents: Model<any>,
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: Types.ObjectId, q: ArticleListQuery) {
    const filter: Record<string, unknown> = { tenantId };
    if (q.status) filter.status = q.status;
    if (q.q) filter.title = { $regex: escapeRe(q.q), $options: 'i' };
    const limit = 20;
    const [docs, total, counts, categories] = await Promise.all([
      this.articles.find(filter, { body: 0 }).sort({ updatedAt: -1 }).skip((q.page - 1) * limit).limit(limit).lean<any[]>(),
      this.articles.countDocuments(filter),
      Promise.all([this.articles.countDocuments({ tenantId, status: 'draft' }), this.articles.countDocuments({ tenantId, status: 'published' })]),
      this.articles.distinct('category', { tenantId }),
    ]);
    return {
      items: docs.map((a) => ({
        id: a._id.toString(), title: a.title, slug: a.slug, category: a.category, status: a.status as ArticleStatus, image: a.image,
        publishedAt: a.publishedAt ? new Date(a.publishedAt).toISOString() : null, updatedAt: new Date(a.updatedAt ?? a.createdAt).toISOString(),
      })),
      page: q.page, totalPages: Math.max(1, Math.ceil(total / limit)), total,
      counts: { draft: counts[0], published: counts[1] },
      categories: (categories as string[]).sort(),
    };
  }

  async get(tenantId: Types.ObjectId, id: string) {
    return this.toDto(await this.find(tenantId, id));
  }

  async create(tenantId: Types.ObjectId, actor: AuthContext, input: ArticleInput, ip: string | null) {
    await this.validateRefs(tenantId, input);
    const slug = await this.resolveSlug(tenantId, input.slug || slugify(input.title), null, !input.slug);
    const doc = await this.articles.create({
      ...this.toDoc(input), tenantId, slug, status: 'draft', publishedAt: null, createdBy: actor.userId, updatedBy: actor.userId,
    });
    await this.audit.record({ tenantId, actor: { id: actor.userId, name: actor.name }, action: 'article.created', targetType: 'article', targetId: doc._id.toString(), summary: `Started the article “${input.title}”`, ip });
    return this.toDto(doc.toObject());
  }

  async update(tenantId: Types.ObjectId, actor: AuthContext, id: string, input: ArticleInput, ip: string | null) {
    const current = await this.find(tenantId, id);
    await this.validateRefs(tenantId, input);
    if (current.status === 'published') {
      const problems = articlePublishProblems(input);
      if (problems.length) throw new BadRequestException({ code: 'PUBLISH_REQUIREMENTS', message: 'This article is live, so it needs to stay complete.', problems });
    }
    const wanted = input.slug || current.slug;
    const slug = wanted === current.slug ? current.slug : await this.resolveSlug(tenantId, wanted, current._id, false);
    if (current.status === 'published' && slug !== current.slug) {
      throw fieldError('slug', 'Unpublish the article before changing its web address, so existing links don’t break.');
    }
    await this.articles.updateOne({ tenantId, _id: current._id }, { $set: { ...this.toDoc(input), slug, updatedBy: actor.userId } });
    await this.audit.record({ tenantId, actor: { id: actor.userId, name: actor.name }, action: 'article.updated', targetType: 'article', targetId: id, summary: `Edited “${input.title}”`, ip });
    return this.get(tenantId, id);
  }

  async setStatus(tenantId: Types.ObjectId, actor: AuthContext, id: string, status: ArticleStatus, ip: string | null) {
    const current = await this.find(tenantId, id);
    if (current.status === status) return this.toDto(current);
    if (status === 'published') {
      const problems = articlePublishProblems({ title: current.title, excerpt: current.excerpt ?? '', body: current.body ?? '', image: current.image ?? '' });
      if (problems.length) throw new BadRequestException({ code: 'PUBLISH_REQUIREMENTS', message: 'Finish these before publishing.', problems });
    }
    const set: Record<string, unknown> = { status, updatedBy: actor.userId };
    if (status === 'published' && !current.publishedAt) set.publishedAt = new Date();
    await this.articles.updateOne({ tenantId, _id: current._id }, { $set: set });
    await this.audit.record({ tenantId, actor: { id: actor.userId, name: actor.name }, action: `article.${status}`, targetType: 'article', targetId: id, summary: `${status === 'published' ? 'Published' : 'Unpublished'} “${current.title}”`, ip });
    return this.get(tenantId, id);
  }

  async remove(tenantId: Types.ObjectId, actor: AuthContext, id: string, ip: string | null) {
    const current = await this.find(tenantId, id);
    if (current.status === 'published') {
      throw new ConflictException({ code: 'NOT_DELETABLE', message: 'Unpublish this article before deleting it.' });
    }
    await this.articles.deleteOne({ tenantId, _id: current._id });
    await this.audit.record({ tenantId, actor: { id: actor.userId, name: actor.name }, action: 'article.deleted', targetType: 'article', targetId: id, summary: `Deleted “${current.title}”`, ip });
  }

  // ---------------------------------------------------------------------------------------------

  private async find(tenantId: Types.ObjectId, id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Article not found.' });
    const doc = await this.articles.findOne({ tenantId, _id: id }).lean<any>();
    if (!doc) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Article not found.' });
    return doc;
  }

  private async validateRefs(tenantId: Types.ObjectId, input: ArticleInput) {
    if (input.authorId && !(await this.agents.exists({ tenantId, _id: input.authorId }))) throw fieldError('authorId', 'Choose an advisor from your team');
    if (input.image && !(await this.media.ownsAll(tenantId, [input.image]))) throw fieldError('image', 'Choose an image from your media library');
  }

  private async resolveSlug(tenantId: Types.ObjectId, wanted: string, selfId: Types.ObjectId | null, autoSuffix: boolean) {
    const base = wanted.slice(0, 110) || 'article';
    for (let i = 0; i < 50; i++) {
      const candidate = i === 0 ? base : `${base}-${i + 1}`;
      const clash = await this.articles.exists({ tenantId, slug: candidate, ...(selfId ? { _id: { $ne: selfId } } : {}) });
      if (!clash) return candidate;
      if (!autoSuffix) throw fieldError('slug', 'Another article already uses this web address');
    }
    throw fieldError('slug', 'Choose a different web address');
  }

  private toDoc(i: ArticleInput) {
    return {
      title: i.title, excerpt: i.excerpt, category: i.category, image: i.image, imageAlt: i.imageAlt, body: i.body,
      authorId: i.authorId ? new Types.ObjectId(i.authorId) : null, seoTitle: i.seoTitle, seoDescription: i.seoDescription,
      readMinutes: readingMinutes(i.body),
    };
  }

  private toDto(a: any) {
    return {
      id: a._id.toString(), title: a.title as string, slug: a.slug as string, excerpt: (a.excerpt ?? '') as string, category: a.category as string,
      image: (a.image ?? '') as string, imageAlt: (a.imageAlt ?? '') as string, body: (a.body ?? '') as string,
      authorId: a.authorId ? a.authorId.toString() : null, seoTitle: (a.seoTitle ?? '') as string, seoDescription: (a.seoDescription ?? '') as string,
      status: a.status as ArticleStatus, readMinutes: a.readMinutes as number,
      publishedAt: a.publishedAt ? new Date(a.publishedAt).toISOString() : null, updatedAt: new Date(a.updatedAt ?? a.createdAt).toISOString(),
    };
  }
}
