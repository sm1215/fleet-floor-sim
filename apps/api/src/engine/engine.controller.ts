import { Controller, Get, HttpCode, Post } from '@nestjs/common';
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
}
