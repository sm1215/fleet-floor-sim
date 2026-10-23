import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { FloorService } from './floor.service.js';

/** Read-only apart from Reset: the floor changes through POST /commands/floor. */
@Controller('floors')
export class FloorController {
  constructor(private readonly service: FloorService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post(':id/reset')
  @HttpCode(200)
  reset(@Param('id', ParseIntPipe) id: number) {
    return this.service.reset(id);
  }
}
