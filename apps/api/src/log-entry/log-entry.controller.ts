import { Controller, Get, ParseIntPipe, Query } from '@nestjs/common';
import { LogEntryService } from './log-entry.service.js';

/** Read-only: the Engine writes every entry (log-entry.md). */
@Controller('log-entries')
export class LogEntryController {
  constructor(private readonly service: LogEntryService) {}

  @Get()
  findAll(@Query('floorId', ParseIntPipe) floorId: number) {
    return this.service.findAll(floorId);
  }
}
