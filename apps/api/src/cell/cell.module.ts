import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cell } from '../../database/entities/index.js';
import { CellController } from './cell.controller.js';
import { CellService } from './cell.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Cell])],
  controllers: [CellController],
  providers: [CellService],
})
export class CellModule {}
