import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Cell,
  Floor,
  LogEntry,
  QueuedCommand,
  Robot,
} from '../../database/entities/index.js';
import { EngineModule } from '../engine/engine.module.js';
import { WriteLockModule } from '../shared/write-lock.js';
import { FloorController } from './floor.controller.js';
import { FloorService } from './floor.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Floor, Cell, Robot, QueuedCommand, LogEntry]),
    EngineModule,
    WriteLockModule,
  ],
  controllers: [FloorController],
  providers: [FloorService],
})
export class FloorModule {}
