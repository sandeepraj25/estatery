import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogSchema } from '../audit/audit.schema.js';
import { AuditService } from '../audit/audit.service.js';
import { MailService } from '../mail/mail.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { InviteSchema, MembershipSchema, PasswordResetSchema, SessionSchema, UserSchema } from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import { TokensService } from './tokens.service.js';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'User', schema: UserSchema },
      { name: 'Membership', schema: MembershipSchema },
      { name: 'Session', schema: SessionSchema },
      { name: 'Invite', schema: InviteSchema },
      { name: 'PasswordReset', schema: PasswordResetSchema },
      { name: 'AuditLog', schema: AuditLogSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokensService, AuthGuard, AuditService, MailService],
  exports: [AuthService, TokensService, AuthGuard, AuditService, MailService, MongooseModule],
})
export class AuthModule {}
