import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueuedCommand } from '../../database/entities/index.js';
import { QueuedCommandController } from './queued-command.controller.js';
import { QueuedCommandService } from './queued-command.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([QueuedCommand])],
  controllers: [QueuedCommandController],
  providers: [QueuedCommandService],
  exports: [QueuedCommandService],
})
export class QueuedCommandModule {}
