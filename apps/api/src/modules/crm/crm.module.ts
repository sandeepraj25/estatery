import { Module } from '@nestjs/common';
import { CrmController, CrmSettingsController } from './crm.controller.js';
import { CrmService } from './crm.service.js';

@Module({ controllers: [CrmController, CrmSettingsController], providers: [CrmService], exports: [CrmService] })
export class CrmModule {}
