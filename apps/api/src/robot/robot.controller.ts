import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateRobotDto } from './dto/create-robot.dto.js';
import { UpdateRobotDto } from './dto/update-robot.dto.js';
import { QueuedCommandService } from '../queued-command/queued-command.service.js';
import { RobotService } from './robot.service.js';

@Controller('robots')
export class RobotController {
  constructor(
    private readonly service: RobotService,
    private readonly queuedCommandService: QueuedCommandService,
  ) {}

  @Post()
  create(@Body() dto: CreateRobotDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id/queued-commands')
  findQueuedCommands(@Param('id', ParseIntPipe) id: number) {
    return this.queuedCommandService.findByRobot(id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRobotDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
