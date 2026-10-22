import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cell, Floor, Robot } from '../../database/entities/index.js';
import { FloorController } from './floor.controller.js';
import { FloorService } from './floor.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Floor, Cell, Robot])],
  controllers: [FloorController],
  providers: [FloorService],
})
export class FloorModule {}
