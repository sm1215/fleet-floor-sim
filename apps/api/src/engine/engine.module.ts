import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module.js';
import { WriteLockModule } from '../shared/write-lock.js';
import { DirectCommandsService } from './direct-commands.service.js';
import { EngineCommandsService } from './engine-commands.service.js';
import { EngineController } from './engine.controller.js';
import { EngineService } from './engine.service.js';

@Module({
  imports: [QueueModule, WriteLockModule],
  controllers: [EngineController],
  providers: [EngineService, EngineCommandsService, DirectCommandsService],
  exports: [EngineService],
})
export class EngineModule {}
