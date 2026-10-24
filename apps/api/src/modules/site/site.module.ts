import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module.js';
import { SiteController } from './site.controller.js';
import { SiteService } from './site.service.js';

@Module({ imports: [PropertiesModule], controllers: [SiteController], providers: [SiteService], exports: [SiteService] })
export class SiteModule {}
