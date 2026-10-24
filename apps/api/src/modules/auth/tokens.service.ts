import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { Types, type Model } from 'mongoose';
import { loadEnv } from '../../config/env.js';

export interface AccessClaims {
  sub: string; // user id
  tid: string; // tenant id
  mid: string; // membership id
  sid: string; // session id
}

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export function safeEqualStr(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Window in which a just-rotated refresh token may be presented again (parallel tabs/requests). */
const ROTATION_GRACE_MS = 30_000;

export type RefreshResult =
  | { ok: true; sessionId: Types.ObjectId; userId: Types.ObjectId; tenantId: Types.ObjectId; refresh: string; expiresAt: Date }
  | { ok: false; reason: 'invalid' | 'expired' | 'reused' | 'race' };

@Injectable()
export class TokensService {
  private readonly env = loadEnv();
  private readonly key = new TextEncoder().encode(this.env.JWT_ACCESS_SECRET);

  constructor(@InjectModel('Session') private readonly sessions: Model<any>) {}

  get accessTtl() {
    return this.env.ACCESS_TOKEN_TTL_SECONDS;
  }

  signAccess(claims: AccessClaims) {
    return new SignJWT({ tid: claims.tid, mid: claims.mid, sid: claims.sid })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(claims.sub)
      .setIssuedAt()
      .setIssuer('estatery-api')
      .setAudience('estatery-admin')
      .setExpirationTime(`${this.accessTtl}s`)
      .sign(this.key);
  }

  async verifyAccess(token: string): Promise<AccessClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: 'estatery-api', audience: 'estatery-admin', algorithms: ['HS256'] });
      const { sub, tid, mid, sid } = payload as Record<string, unknown>;
      if ([sub, tid, mid, sid].every((v) => typeof v === 'string' && Types.ObjectId.isValid(v))) {
        return { sub: sub as string, tid: tid as string, mid: mid as string, sid: sid as string };
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Starts a new session family at login. Refresh token format: "<sessionId>.<secret>". */
  async createSession(input: { tenantId: Types.ObjectId; userId: Types.ObjectId; userAgent: string | null; ip: string | null; familyId?: string }) {
    const secret = randomToken();
    const expiresAt = new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 86400_000);
    const session = await this.sessions.create({
      tenantId: input.tenantId,
      userId: input.userId,
      familyId: input.familyId ?? randomUUID(),
      tokenHash: sha256(secret),
      expiresAt,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
      ip: input.ip,
    });
    return { sessionId: session._id as Types.ObjectId, refresh: `${session._id}.${secret}`, expiresAt };
  }

  /** Rotates a refresh token. Replaying an already-rotated token revokes every session in its family. */
  async rotate(tenantId: Types.ObjectId, raw: string, meta: { userAgent: string | null; ip: string | null }): Promise<RefreshResult> {
    const [id, secret] = raw.split('.');
    if (!id || !secret || !Types.ObjectId.isValid(id)) return { ok: false, reason: 'invalid' };
    const s = await this.sessions.findOne({ tenantId, _id: id }).lean<any>();
    if (!s || !safeEqualStr(s.tokenHash, sha256(secret))) return { ok: false, reason: 'invalid' };

    if (s.revokedAt) {
      if (s.revokedReason === 'rotated' && Date.now() - new Date(s.revokedAt).getTime() < ROTATION_GRACE_MS) {
        return { ok: false, reason: 'race' };
      }
      await this.revokeFamily(tenantId, s.familyId, 'reuse-detected');
      return { ok: false, reason: 'reused' };
    }
    if (new Date(s.expiresAt).getTime() < Date.now()) return { ok: false, reason: 'expired' };

    const next = await this.createSession({ tenantId, userId: s.userId, familyId: s.familyId, ...meta });
    // Conditional update: if two requests race, only one rotation wins.
    const won = await this.sessions.updateOne(
      { tenantId, _id: s._id, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: 'rotated', replacedBy: next.sessionId } },
    );
    if (won.modifiedCount === 0) {
      await this.sessions.deleteOne({ tenantId, _id: next.sessionId });
      return { ok: false, reason: 'race' };
    }
    return { ok: true, sessionId: next.sessionId, userId: s.userId, tenantId, refresh: next.refresh, expiresAt: next.expiresAt };
  }

  async isSessionActive(tenantId: Types.ObjectId, sessionId: string) {
    const s = await this.sessions.findOne({ tenantId, _id: sessionId }, { revokedAt: 1, expiresAt: 1 }).lean<any>();
    return !!s && !s.revokedAt && new Date(s.expiresAt).getTime() > Date.now();
  }

  revokeSession(tenantId: Types.ObjectId, sessionId: string, reason = 'logout') {
    return this.sessions.updateOne({ tenantId, _id: sessionId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } });
  }

  revokeFamily(tenantId: Types.ObjectId, familyId: string, reason: string) {
    return this.sessions.updateMany({ tenantId, familyId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } });
  }

  /** Signs the user out everywhere in this agency (password change, deactivation, "sign out all"). */
  revokeAllForUser(tenantId: Types.ObjectId, userId: Types.ObjectId | string, reason: string) {
    return this.sessions.updateMany({ tenantId, userId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } });
  }

  /** Password resets apply to the identity, so sessions in every agency are revoked. */
  revokeAllForUserEverywhere(userId: Types.ObjectId, reason: string) {
    return this.sessions
      .updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } })
      .setOptions({ crossTenant: true });
  }
}
