import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { hash } from '@node-rs/argon2';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { createAgencySchema } from '@estatery/shared';
import { AppModule } from '../app.module.js';
import { PlatformService } from '../modules/admin/platform.service.js';

/**
 * First-run setup for a new platform: creates the platform's own agency and a platform-operator
 * owner account, and prints a one-time password. Safe to run once; refuses if an operator exists.
 *
 *   node dist/scripts/create-operator.js --name "Estatery" --slug hq --email you@company.com --owner "Your Name"
 */
function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

process.env.RUN_WORKERS = 'false';
const app = await NestFactory.createApplicationContext(AppModule, { logger: process.env.DEBUG_SETUP ? ['log', 'warn', 'error'] : ['error'] });
try {
  const users = app.get<Model<any>>(getModelToken('User'));
  const memberships = app.get<Model<any>>(getModelToken('Membership'));
  const invites = app.get<Model<any>>(getModelToken('Invite'));
  if (await users.exists({ platformOwner: true })) {
    console.error('A platform operator already exists. Sign in and create agencies from Admin Panel → All agencies.');
    process.exitCode = 1;
  } else {
    const input = createAgencySchema.parse({
      name: arg('name') ?? 'Platform HQ', slug: arg('slug') ?? 'hq', ownerName: arg('owner') ?? 'Platform operator',
      ownerEmail: arg('email'), themePreset: arg('theme') ?? 'forest-champagne',
    });
    const systemActor = { userId: new Types.ObjectId(), name: 'Setup', role: 'owner', platformOwner: true } as never;
    const created = await app.get(PlatformService).createTenant(systemActor, input, null);
    const password = randomBytes(12).toString('base64url');
    const user = await users.create({
      email: input.ownerEmail, name: input.ownerName, platformOwner: true,
      passwordHash: await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 }),
    });
    await memberships.create({ tenantId: new Types.ObjectId(created.id), userId: user._id, role: 'owner', status: 'active' });
    await invites.updateMany({ tenantId: new Types.ObjectId(created.id), email: input.ownerEmail }, { $set: { revokedAt: new Date() } });
    console.log(`\nPlatform agency: ${created.hostname}`);
    console.log(`Operator:        ${input.ownerEmail}`);
    console.log(`Password:        ${password}   (shown once; change it under Your account)\n`);
  }
} finally {
  await app.close();
  // Shared Redis clients (rate limiting) keep the event loop alive; finish once output is flushed.
  await new Promise<void>((resolve) => process.stdout.write('', () => resolve()));
  process.exit(process.exitCode ?? 0);
}
