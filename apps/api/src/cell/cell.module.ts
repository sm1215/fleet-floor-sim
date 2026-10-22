import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cell, Robot } from '../../database/entities/index.js';
import { WriteLockModule } from '../shared/write-lock.js';
import { CellController } from './cell.controller.js';
import { CellService } from './cell.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Cell, Robot]), WriteLockModule],
  controllers: [CellController],
  providers: [CellService],
})
export class CellModule {}
