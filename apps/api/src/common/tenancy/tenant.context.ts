import { createParamDecorator, InternalServerErrorException, type ExecutionContext } from '@nestjs/common';
import type { Types } from 'mongoose';

export interface ResolvedTenant {
  id: Types.ObjectId;
  slug: string;
  name: string;
  status: 'trial' | 'active' | 'suspended';
  hostname: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    tenant?: ResolvedTenant;
  }
}

/** Injects the tenant resolved from the request hostname. Never read a tenant id from the body. */
export const CurrentTenant = createParamDecorator((_: unknown, ctx: ExecutionContext): ResolvedTenant => {
  const req = ctx.switchToHttp().getRequest();
  if (!req.tenant) throw new InternalServerErrorException('Tenant middleware did not run for this route');
  return req.tenant;
});
