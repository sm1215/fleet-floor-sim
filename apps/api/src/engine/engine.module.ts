import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module.js';
import { EngineCommandsService } from './engine-commands.service.js';
import { EngineController } from './engine.controller.js';
import { EngineService } from './engine.service.js';

@Module({
  imports: [QueueModule],
  controllers: [EngineController],
  providers: [EngineService, EngineCommandsService],
  exports: [EngineService],
})
export class EngineModule {}
