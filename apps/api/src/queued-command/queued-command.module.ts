import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueuedCommand } from '../../database/entities/index.js';
import { QueuedCommandService } from './queued-command.service.js';

/** No routes of its own: a robot's queue is read via GET /robots/:id/queued-commands. */
@Module({
  imports: [TypeOrmModule.forFeature([QueuedCommand])],
  providers: [QueuedCommandService],
  exports: [QueuedCommandService],
})
export class QueuedCommandModule {}
