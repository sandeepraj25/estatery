import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MediaController } from './media.controller.js';
import { MediaSchema } from './media.schema.js';
import { MediaService } from './media.service.js';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: 'Media', schema: MediaSchema }])],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
