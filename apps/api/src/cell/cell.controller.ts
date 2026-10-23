import { Controller, Get } from '@nestjs/common';
import { CellService } from './cell.service.js';

/** Read-only: cells change through POST /commands/* (commands.md). */
@Controller('cells')
export class CellController {
  constructor(private readonly service: CellService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
