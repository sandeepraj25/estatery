import {
  CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import type { Request } from 'express';
import type { Model, Types } from 'mongoose';
import { can, ROLE_PERMISSIONS, type Permission, type TenantRole } from '@estatery/shared';
import { cookieNames, readCookie } from './cookies.js';
import { TokensService } from './tokens.service.js';

export interface AuthContext {
  userId: Types.ObjectId;
  name: string;
  email: string;
  role: TenantRole;
  permissions: Permission[];
  platformOwner: boolean;
  membershipId: Types.ObjectId;
  agentId: Types.ObjectId | null;
  sessionId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

const PERMISSION_KEY = 'requiredPermissions';
const PLATFORM_KEY = 'platformOnly';

/** Every listed permission is required. Use with AuthGuard. */
export const RequirePermission = (...perms: Permission[]) => SetMetadata(PERMISSION_KEY, perms);
/** Only platform owners (the SaaS operator), never a tenant's own admins. */
export const PlatformOnly = () => SetMetadata(PLATFORM_KEY, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.auth) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Please sign in.' });
  return req.auth;
});

/**
 * Authenticates admin requests:
 *  1. verifies the access-token JWT from the HttpOnly cookie;
 *  2. requires the token's tenant to equal the tenant resolved from the hostname, so a token
 *     issued on agency-a.com is useless on agency-b.com;
 *  3. re-reads the session and membership from the database, so sign-out, deactivation and role
 *     changes take effect immediately rather than when the token expires;
 *  4. enforces @RequirePermission / @PlatformOnly.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokensService,
    private readonly reflector: Reflector,
    @InjectModel('Membership') private readonly memberships: Model<any>,
    @InjectModel('User') private readonly users: Model<any>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const tenant = req.tenant;
    const unauth = (message = 'Please sign in to continue.') => new UnauthorizedException({ code: 'UNAUTHENTICATED', message });
    if (!tenant) throw unauth();

    const token = readCookie(req, cookieNames().access);
    if (!token) throw unauth();
    const claims = await this.tokens.verifyAccess(token);
    if (!claims) throw unauth('Your session has expired. Please sign in again.');
    if (claims.tid !== tenant.id.toString()) throw unauth('This session belongs to a different site.');

    const [active, membership, user] = await Promise.all([
      this.tokens.isSessionActive(tenant.id, claims.sid),
      this.memberships.findOne({ tenantId: tenant.id, _id: claims.mid, userId: claims.sub }).lean<any>(),
      this.users.findById(claims.sub, { name: 1, email: 1, platformOwner: 1 }).lean<any>(),
    ]);
    if (!active || !membership || !user) throw unauth('Your session has ended. Please sign in again.');
    if (membership.status !== 'active') throw unauth('Your access to this site has been removed.');

    const role = membership.role as TenantRole;
    req.auth = {
      userId: user._id,
      name: user.name,
      email: user.email,
      role,
      permissions: [...ROLE_PERMISSIONS[role]],
      platformOwner: user.platformOwner === true,
      membershipId: membership._id,
      agentId: membership.agentId ?? null,
      sessionId: claims.sid,
    };

    const handler = ctx.getHandler();
    const cls = ctx.getClass();
    const platformOnly = this.reflector.getAllAndOverride<boolean>(PLATFORM_KEY, [handler, cls]);
    if (platformOnly && !req.auth.platformOwner) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'This area is only available to the platform operator.' });
    }
    const required = this.reflector.getAllAndMerge<Permission[]>(PERMISSION_KEY, [cls, handler]) ?? [];
    const missing = required.filter((p) => !can(role, p));
    if (missing.length) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Your role doesn’t allow this action.' });
    }
    return true;
  }
}
