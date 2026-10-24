import { BadRequestException, Body, Controller, ConflictException, Headers, HttpCode, NotFoundException, Post } from '@nestjs/common';
import mongoose from 'mongoose';
import { loadEnv } from '../config/env.js';
import { safeEqualStr } from '../modules/auth/tokens.service.js';
import { normaliseHost } from '../modules/tenants/hostname.js';
import { seedDatabase } from '../scripts/seed.js';

/**
 * One-time bootstrap for a hosted database that can't be reached from a developer machine
 * (e.g. Vercel + Atlas): loads the demo dataset (`pnpm seed`) and serves the demo agency on the
 * given hostnames.
 *
 * - Off unless SETUP_TOKEN is set; remove the variable once setup is done.
 * - Refuses when the database already holds any agency or user, so it can never wipe real data.
 */
@Controller('internal/setup')
export class SetupController {
  @Post('demo')
  @HttpCode(201)
  async demo(@Headers('authorization') auth: string | undefined, @Body() body: { hostnames?: unknown }) {
    const token = process.env.SETUP_TOKEN;
    if (!token || token.length < 24) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
    if (!auth || !safeEqualStr(auth, `Bearer ${token}`)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });

    const hostnames = Array.isArray(body?.hostnames) ? body.hostnames.map((h) => normaliseHost(String(h))) : [];
    if (!hostnames.length || hostnames.some((h) => !h)) {
      throw new BadRequestException({ code: 'VALIDATION', message: 'hostnames: a list of valid hostnames is required' });
    }

    // A separate connection, exactly like `pnpm seed`, so the app's tenant-scoped models are untouched.
    const conn = await mongoose.createConnection(loadEnv().MONGODB_URI, { serverSelectionTimeoutMS: 8_000 }).asPromise();
    try {
      const db = conn.db!;
      const [tenants, users] = await Promise.all([db.collection('tenants').estimatedDocumentCount(), db.collection('users').estimatedDocumentCount()]);
      if (tenants > 0 || users > 0) throw new ConflictException({ code: 'ALREADY_SET_UP', message: 'This database already has data; setup only runs on an empty database.' });

      const ids = await seedDatabase(conn, { extraHosts: hostnames as string[] });
      // The first hostname becomes the demo agency's main address (used in email links).
      await db.collection('domains').updateMany({ tenantId: ids.aurelia }, { $set: { isPrimary: false } });
      await db.collection('domains').updateOne({ tenantId: ids.aurelia, hostname: hostnames[0] }, { $set: { isPrimary: true } });
      return { ok: true, database: db.databaseName, tenants: { aurelia: String(ids.aurelia), banyan: String(ids.banyan) }, hostnames };
    } finally {
      await conn.close();
    }
  }
}
