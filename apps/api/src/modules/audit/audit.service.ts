import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';

export interface AuditEntry {
  tenantId: Types.ObjectId;
  actor?: { id: Types.ObjectId | string; name: string } | null;
  action: string;
  targetType?: string;
  targetId?: string;
  summary: string;
  meta?: Record<string, unknown>;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(@InjectModel('AuditLog') private readonly logs: Model<any>) {}

  /** Never throws: a failed audit write must not break the user's action, but it is logged loudly. */
  async record(e: AuditEntry) {
    try {
      await this.logs.create({
        tenantId: e.tenantId,
        actorId: e.actor?.id ?? null,
        actorName: e.actor?.name ?? 'System',
        action: e.action,
        targetType: e.targetType ?? null,
        targetId: e.targetId ?? null,
        summary: e.summary,
        meta: e.meta ?? {},
        ip: e.ip ?? null,
      });
    } catch (err) {
      this.logger.error(`Audit write failed for ${e.action}: ${(err as Error).message}`);
    }
  }

  async list(tenantId: Types.ObjectId, page = 1, limit = 30) {
    const [items, total] = await Promise.all([
      this.logs.find({ tenantId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean<any[]>(),
      this.logs.countDocuments({ tenantId }),
    ]);
    return {
      items: items.map((l) => ({
        id: l._id.toString(), action: l.action, summary: l.summary, actorName: l.actorName,
        targetType: l.targetType, ip: l.ip, createdAt: new Date(l.createdAt).toISOString(),
      })),
      page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
