import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueuedCommand, Robot } from '../../database/entities/index.js';
import { QueueService } from './queue.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Robot, QueuedCommand])],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
