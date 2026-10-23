import { Module } from '@nestjs/common';
import { HistoryService } from './history.service.js';

/** Snapshots and past floor states; every call takes the caller's manager. */
@Module({
  providers: [HistoryService],
  exports: [HistoryService],
})
export class HistoryModule {}
