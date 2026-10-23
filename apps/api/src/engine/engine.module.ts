import { Module } from '@nestjs/common';
import { LogEntryModule } from '../log-entry/log-entry.module.js';
import { QueueModule } from '../queue/queue.module.js';
import { WriteLockModule } from '../shared/write-lock.js';
import { DirectCommandsService } from './direct-commands.service.js';
import { EngineCommandsService } from './engine-commands.service.js';
import { CommandsController } from './commands.controller.js';
import { EngineController } from './engine.controller.js';
import { EngineService } from './engine.service.js';

@Module({
  imports: [QueueModule, WriteLockModule, LogEntryModule],
  controllers: [EngineController, CommandsController],
  providers: [EngineService, EngineCommandsService, DirectCommandsService],
  exports: [EngineService],
})
export class EngineModule {}
