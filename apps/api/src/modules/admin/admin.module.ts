import { ArticlesAdminController } from './articles-admin.controller.js';
import { ArticlesAdminService } from './articles-admin.service.js';
import { Module } from '@nestjs/common';
import { AdminController, PlatformController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { PlatformService } from './platform.service.js';
import { LibraryService } from './library.service.js';
import { LibraryController, SiteEditorController } from './site-editor.controller.js';
import { SiteEditorService } from './site-editor.service.js';
import { SiteModule } from '../site/site.module.js';
import { PropertyAdminController } from './property-admin.controller.js';
import { PropertyAdminService } from './property-admin.service.js';
import { TeamService } from './team.service.js';

@Module({ imports: [SiteModule], controllers: [ArticlesAdminController, SiteEditorController, LibraryController, PropertyAdminController, AdminController, PlatformController], providers: [ArticlesAdminService, AdminService, TeamService, PlatformService, PropertyAdminService, SiteEditorService, LibraryService] })
export class AdminModule {}
