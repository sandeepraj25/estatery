import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RedirectSchema } from './redirect.schema.js';
import { RedirectsController } from './redirects.controller.js';
import { RedirectsService } from './redirects.service.js';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: 'Redirect', schema: RedirectSchema }])],
  controllers: [RedirectsController],
  providers: [RedirectsService],
  exports: [RedirectsService],
})
export class RedirectsModule {}
