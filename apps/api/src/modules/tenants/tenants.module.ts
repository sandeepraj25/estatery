import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DomainSchema, TenantSchema } from './tenant.schemas.js';
import { TenantsService } from './tenants.service.js';

@Global()
@Module({
  imports: [MongooseModule.forFeature([
    { name: 'Tenant', schema: TenantSchema },
    { name: 'Domain', schema: DomainSchema },
  ])],
  providers: [TenantsService],
  exports: [TenantsService, MongooseModule],
})
export class TenantsModule {}
