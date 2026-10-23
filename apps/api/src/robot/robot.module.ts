import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Robot } from '../../database/entities/index.js';
import { QueuedCommandModule } from '../queued-command/queued-command.module.js';
import { RobotController } from './robot.controller.js';
import { RobotService } from './robot.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Robot]), QueuedCommandModule],
  controllers: [RobotController],
  providers: [RobotService],
})
export class RobotModule {}
