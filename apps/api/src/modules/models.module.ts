import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LeadActivitySchema, LeadReminderSchema, LeadSchema } from './leads/lead.schema.js';
import { PropertySchema } from './properties/property.schema.js';
import {
  AgentSchema,
  ArticleSchema,
  LocationSchema,
  PageSchema,
  ProjectSchema,
  SiteVersionSchema,
  TestimonialSchema,
  ThemeSchema,
} from './site/site.schemas.js';

/** Registers every tenant-owned model once so feature modules can inject any of them. */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Property', schema: PropertySchema },
      { name: 'Agent', schema: AgentSchema },
      { name: 'Project', schema: ProjectSchema },
      { name: 'Location', schema: LocationSchema },
      { name: 'Testimonial', schema: TestimonialSchema },
      { name: 'Article', schema: ArticleSchema },
      { name: 'Theme', schema: ThemeSchema },
      { name: 'Page', schema: PageSchema },
      { name: 'Lead', schema: LeadSchema },
      { name: 'LeadActivity', schema: LeadActivitySchema },
      { name: 'LeadReminder', schema: LeadReminderSchema },
      { name: 'SiteVersion', schema: SiteVersionSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class ModelsModule {}
