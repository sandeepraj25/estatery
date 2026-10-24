import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BillingController, BillingWebhookController, PlatformBillingController } from './billing.controller.js';
import { BillingEventSchema, BillingPaymentSchema, BillingPlanSchema, BillingSimSubscriptionSchema } from './billing.schemas.js';
import { BillingService } from './billing.service.js';
import { EntitlementsService } from './entitlements.service.js';

/** Global so any feature module can check plan limits through EntitlementsService. */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'BillingPlan', schema: BillingPlanSchema },
      { name: 'BillingEvent', schema: BillingEventSchema },
      { name: 'BillingPayment', schema: BillingPaymentSchema },
      { name: 'BillingSimSubscription', schema: BillingSimSubscriptionSchema },
    ]),
  ],
  controllers: [BillingController, PlatformBillingController, BillingWebhookController],
  providers: [BillingService, EntitlementsService],
  exports: [BillingService, EntitlementsService],
})
export class BillingModule {}
