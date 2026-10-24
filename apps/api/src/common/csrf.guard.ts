import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { cookieNames, readCookie } from '../modules/auth/cookies.js';
import { safeEqualStr } from '../modules/auth/tokens.service.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF protection for cookie-authenticated endpoints. A cross-site page can make
 * the browser send our cookies, but it can't read the csrf cookie to copy it into the header.
 * SameSite cookies are a second, independent layer.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE.has(req.method)) return true;
    const cookie = readCookie(req, cookieNames().csrf);
    const header = req.header('x-csrf-token');
    if (!cookie || !header || !safeEqualStr(cookie, header)) {
      throw new ForbiddenException({ code: 'CSRF_FAILED', message: 'Your form expired. Refresh the page and try again.' });
    }
    return true;
  }
}
