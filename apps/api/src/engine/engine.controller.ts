import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
} from '@nestjs/common';
import { SelectFloorDto } from './dto/select-floor.dto.js';
import { EngineService } from './engine.service.js';

@Controller('engine')
export class EngineController {
  constructor(private readonly service: EngineService) {}

  @Get()
  getState() {
    return this.service.getState();
  }

  @Post('step')
  @HttpCode(200)
  step() {
    return this.service.step();
  }

  @Post('toggle')
  @HttpCode(200)
  toggle() {
    return this.service.toggle();
  }

  /** Makes the floor active and pauses; unknown floor → 400. */
  @Post('floor')
  @HttpCode(200)
  async selectFloor(@Body() dto: SelectFloorDto) {
    const result = await this.service.selectFloor(dto.floorId);
    if (!result.ok) throw new BadRequestException(result.reason);
    return this.service.getState();
  }
}
