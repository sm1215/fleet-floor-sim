import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Robot } from '../../database/entities/index.js';
import { RobotController } from './robot.controller.js';
import { RobotService } from './robot.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Robot])],
  controllers: [RobotController],
  providers: [RobotService],
})
export class RobotModule {}
