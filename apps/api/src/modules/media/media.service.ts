import { BadRequestException, ConflictException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'node:crypto';
import { isValidObjectId, Types, type Model } from 'mongoose';
import sharp, { type Metadata } from 'sharp';
import { loadEnv } from '../../config/env.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.guard.js';
import { createStorage, type MediaStorage } from './storage.js';

const ACCEPTED = new Set(['jpeg', 'png', 'webp', 'avif', 'heif']);
const MAX_EDGE = 2560;
const MIN_EDGE = 400;

/**
 * Image uploads. Every file is decoded and re-encoded by sharp, which:
 *  - proves it really is an image (the browser's MIME type and file extension are ignored);
 *  - strips EXIF metadata, including GPS coordinates of the owner's home;
 *  - discards anything appended to the file (polyglot payloads);
 *  - normalises orientation and size, and stores a web-ready WebP.
 */
@Injectable()
export class MediaService {
  private readonly storage: MediaStorage = createStorage();
  private readonly maxBytes = loadEnv().MEDIA_MAX_UPLOAD_MB * 1024 * 1024;

  constructor(
    @InjectModel('Media') private readonly media: Model<any>,
    @InjectModel('Property') private readonly properties: Model<any>,
    private readonly audit: AuditService,
  ) {}

  async upload(tenantId: Types.ObjectId, actor: AuthContext, file: { buffer: Buffer; size: number; originalname?: string } | undefined, alt = '') {
    if (!file?.buffer?.length) throw new BadRequestException({ code: 'NO_FILE', message: 'Choose an image to upload.' });
    if (file.size > this.maxBytes) throw new PayloadTooLargeException({ code: 'FILE_TOO_LARGE', message: `Images must be under ${loadEnv().MEDIA_MAX_UPLOAD_MB} MB.` });

    let meta: Metadata;
    try {
      meta = await sharp(file.buffer, { limitInputPixels: 60_000_000 }).metadata();
    } catch {
      throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'That file isn’t a supported image. Use JPG, PNG, WebP or AVIF.' });
    }
    if (!meta.format || !ACCEPTED.has(meta.format)) {
      throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'That file isn’t a supported image. Use JPG, PNG, WebP or AVIF.' });
    }
    if (Math.max(meta.width ?? 0, meta.height ?? 0) < MIN_EDGE) {
      throw new BadRequestException({ code: 'IMAGE_TOO_SMALL', message: `Images need to be at least ${MIN_EDGE}px on the longest side to look sharp on the website.` });
    }

    const { data, info } = await sharp(file.buffer, { limitInputPixels: 60_000_000 })
      .rotate() // apply EXIF orientation, then metadata is dropped (sharp strips by default)
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

    const id = new Types.ObjectId();
    const key = `tenants/${tenantId}/${id}-${randomBytes(4).toString('hex')}.webp`;
    const url = await this.storage.put(key, data, 'image/webp');
    const doc = await this.media.create({
      _id: id, tenantId, key, url, mime: 'image/webp', width: info.width, height: info.height, bytes: info.size,
      alt: alt.slice(0, 200), originalName: (file.originalname ?? '').slice(0, 200), uploadedBy: actor.userId,
    });
    return this.toDto(doc.toObject());
  }

  async list(tenantId: Types.ObjectId, page = 1, limit = 40) {
    const [docs, total] = await Promise.all([
      this.media.find({ tenantId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean<any[]>(),
      this.media.countDocuments({ tenantId }),
    ]);
    return { items: docs.map((d) => this.toDto(d)), page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async updateAlt(tenantId: Types.ObjectId, id: string, alt: string) {
    if (!isValidObjectId(id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Image not found.' });
    const doc = await this.media.findOneAndUpdate({ tenantId, _id: id }, { $set: { alt: alt.slice(0, 200) } }, { new: true }).lean<any>();
    if (!doc) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Image not found.' });
    return this.toDto(doc);
  }

  /** Refuses to delete images still used by a listing, so the public site never shows a hole. */
  async remove(tenantId: Types.ObjectId, actor: AuthContext, id: string, ip: string | null) {
    if (!isValidObjectId(id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Image not found.' });
    const doc = await this.media.findOne({ tenantId, _id: id }).lean<any>();
    if (!doc) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Image not found.' });
    const usedBy = await this.properties.find({ tenantId, 'images.url': doc.url }, { title: 1 }).limit(5).lean<any[]>();
    if (usedBy.length) {
      throw new ConflictException({ code: 'IN_USE', message: `This image is used by ${usedBy.map((p) => `“${p.title}”`).join(', ')}. Remove it from those listings first.` });
    }
    await this.storage.remove(doc.key);
    await this.media.deleteOne({ tenantId, _id: id });
    await this.audit.record({ tenantId, actor: { id: actor.userId, name: actor.name }, action: 'media.deleted', targetType: 'media', targetId: id, summary: `Deleted image ${doc.originalName || id}`, ip });
  }

  /** True if every URL is either an image this tenant uploaded or an allowed external/platform URL. */
  async ownsAll(tenantId: Types.ObjectId, urls: string[]) {
    const s3 = loadEnv().S3_PUBLIC_BASE_URL?.replace(/\/$/, '');
    const isPlatform = (u: string) => u.startsWith('/media/') || (!!s3 && u.startsWith(`${s3}/`));
    const ownPrefix = (u: string) => u.startsWith(`/media/${tenantId}/`) || (!!s3 && u.startsWith(`${s3}/tenants/${tenantId}/`));
    const local = urls.filter(isPlatform);
    // Another agency's uploads can never be attached, even by guessing the URL.
    if (local.some((u) => !ownPrefix(u))) return false;
    if (!local.length) return true;
    const found = await this.media.countDocuments({ tenantId, url: { $in: local } });
    return found === new Set(local).size;
  }

  private toDto(d: any) {
    return {
      id: d._id.toString(), url: d.url as string, width: d.width as number, height: d.height as number, bytes: d.bytes as number,
      alt: d.alt as string, originalName: d.originalName as string, createdAt: new Date(d.createdAt).toISOString(),
    };
  }
}
