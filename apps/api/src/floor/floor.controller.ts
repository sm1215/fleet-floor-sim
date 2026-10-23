import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { EngineService } from '../engine/engine.service.js';
import { ForkFloorDto } from './dto/fork-floor.dto.js';
import { FloorService } from './floor.service.js';

/** Read-only apart from Reset: the floor changes through POST /commands/floor. */
@Controller('floors')
export class FloorController {
  constructor(
    private readonly service: FloorService,
    private readonly engine: EngineService,
  ) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  /** The floor at a past tick (timeline.md); ignored → 400 with the reason. */
  @Get(':id/history')
  async history(
    @Param('id', ParseIntPipe) id: number,
    @Query('tick') tick = '',
  ) {
    const result = await this.engine.history(
      id,
      tick.trim() === '' ? NaN : Number(tick),
    );
    if (!result.ok) throw new BadRequestException(result.reason);
    return result.state;
  }

  /** Fork From Here (timeline.md); ignored → 400 with the reason. */
  @Post(':id/fork')
  @HttpCode(200)
  async fork(@Param('id', ParseIntPipe) id: number, @Body() dto: ForkFloorDto) {
    const result = await this.engine.fork(id, dto.tick);
    if (!result.ok) throw new BadRequestException(result.reason);
    return { floorId: result.floorId };
  }

  /** Delete Floor (timeline.md); unknown → 404. POST, not DELETE (crud.e2e). */
  @Post(':id/delete')
  @HttpCode(200)
  async deleteFloor(@Param('id', ParseIntPipe) id: number) {
    const result = await this.engine.deleteFloor(id);
    if (!result.ok) throw new NotFoundException(result.reason);
    return this.engine.getState();
  }

  @Post(':id/reset')
  @HttpCode(200)
  reset(@Param('id', ParseIntPipe) id: number) {
    return this.service.reset(id);
  }
}
