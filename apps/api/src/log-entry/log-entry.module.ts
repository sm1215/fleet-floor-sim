import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogEntry } from '../../database/entities/index.js';
import { LogEntryController } from './log-entry.controller.js';
import { LogEntryService } from './log-entry.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([LogEntry])],
  controllers: [LogEntryController],
  providers: [LogEntryService],
  exports: [LogEntryService],
})
export class LogEntryModule {}
