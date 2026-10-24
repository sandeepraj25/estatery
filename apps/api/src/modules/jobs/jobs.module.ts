import { Global, Module } from '@nestjs/common';
import { JobsService } from './jobs.service.js';
import { QueueService } from './queue.service.js';

@Global()
@Module({ providers: [QueueService, JobsService], exports: [QueueService, JobsService] })
export class JobsModule {}
