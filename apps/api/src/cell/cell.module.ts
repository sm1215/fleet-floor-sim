import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cell, Robot } from '../../database/entities/index.js';
import { CellController } from './cell.controller.js';
import { CellService } from './cell.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Cell, Robot])],
  controllers: [CellController],
  providers: [CellService],
})
export class CellModule {}
