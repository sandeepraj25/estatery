import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { z } from 'zod';
import { clientIp } from '../../common/client-ip.js';
import { CsrfGuard } from '../../common/csrf.guard.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { CurrentTenant, type ResolvedTenant } from '../../common/tenancy/tenant.context.js';
import { loadEnv } from '../../config/env.js';
import { AuthGuard, CurrentUser, type AuthContext } from '../auth/auth.guard.js';
import { MediaService } from './media.service.js';

/** Anyone who edits listings or website content can manage the image library. */
function requireMediaAccess(u: AuthContext) {
  if (!u.permissions.includes('properties:write') && !u.permissions.includes('content:write')) {
    throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Your role can’t manage images.' });
  }
}

@Controller('v1/admin/media')
@UseGuards(AuthGuard, CsrfGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  list(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Query(new ZodPipe(z.object({ page: z.coerce.number().int().min(1).max(500).default(1) }))) q: { page: number }) {
    requireMediaAccess(u);
    return this.media.list(t.id, q.page);
  }

  @Post()
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', {
      // No storage option: files stay in memory until sharp has validated them.
      limits: { fileSize: loadEnv().MEDIA_MAX_UPLOAD_MB * 1024 * 1024 + 1, files: 1, fields: 4 },
    }),
  )
  upload(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @UploadedFile() file: { buffer: Buffer; size: number; originalname?: string } | undefined, @Body() body: { alt?: unknown }) {
    requireMediaAccess(u);
    return this.media.upload(t.id, u, file, typeof body?.alt === 'string' ? body.alt : '');
  }

  @Patch(':id')
  updateAlt(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('id') id: string, @Body(new ZodPipe(z.object({ alt: z.string().trim().max(200) }))) body: { alt: string }) {
    requireMediaAccess(u);
    return this.media.updateAlt(t.id, id, body.alt);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentTenant() t: ResolvedTenant, @CurrentUser() u: AuthContext, @Param('id') id: string, @Req() req: Request) {
    requireMediaAccess(u);
    await this.media.remove(t.id, u, id, clientIp(req));
  }
}
