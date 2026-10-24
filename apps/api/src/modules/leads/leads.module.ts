import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module.js';
import { CrmModule } from '../crm/crm.module.js';
import { LeadsController } from './leads.controller.js';
import { LeadsService } from './leads.service.js';

@Module({ imports: [PropertiesModule, CrmModule], controllers: [LeadsController], providers: [LeadsService] })
export class LeadsModule {}
