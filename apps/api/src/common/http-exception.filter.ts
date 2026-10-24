import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { reportError } from './monitoring.js';

/**
 * One error envelope for every endpoint: { error: { code, message, fields? } }.
 * Unexpected errors are logged server-side and never leak stack traces or internals to clients.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    // Handlers that stream files (e.g. CSV export) set their own headers up front; errors are always JSON.
    if (!res.headersSent) {
      res.removeHeader('content-disposition');
      res.setHeader('content-type', 'application/json; charset=utf-8');
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      let obj = typeof body === 'string' ? { message: body } : (body as Record<string, unknown>);
      // Rate-limit responses from the throttler carry no code; give people a clear next step.
      if (status === 429 && !obj.code) obj = { code: 'RATE_LIMITED', message: 'Too many attempts in a short time. Please wait a minute and try again.' };
      res.status(status).json({
        error: {
          code: (obj.code as string) ?? HttpStatus[status] ?? 'ERROR',
          message: Array.isArray(obj.message) ? obj.message.join(', ') : (obj.message ?? 'Request failed'),
          ...(obj.fields ? { fields: obj.fields } : {}),
          ...(obj.problems ? { problems: obj.problems } : {}),
        },
      });
      return;
    }
    const req = host.switchToHttp().getRequest<Request & { tenant?: { slug: string } }>();
    const requestId = String(res.getHeader('x-request-id') ?? '');
    reportError(exception, { requestId, tenant: req.tenant?.slug, path: req.path, method: req.method });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: `Something went wrong. Please try again.${requestId ? ` If it keeps happening, quote reference ${requestId.slice(0, 8)}.` : ''}`, requestId } });
  }
}
