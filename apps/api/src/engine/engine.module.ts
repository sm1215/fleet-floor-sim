import { Module } from '@nestjs/common';
import { EngineController } from './engine.controller.js';
import { EngineService } from './engine.service.js';

@Module({
  controllers: [EngineController],
  providers: [EngineService],
  exports: [EngineService],
})
export class EngineModule {}
