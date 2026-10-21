import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Floor } from '../../database/entities/index.js';
import { FloorController } from './floor.controller.js';
import { FloorService } from './floor.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Floor])],
  controllers: [FloorController],
  providers: [FloorService],
})
export class FloorModule {}
