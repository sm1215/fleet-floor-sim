import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { QueuedCommandService } from '../queued-command/queued-command.service.js';
import { RobotService } from './robot.service.js';

/** Read-only: robots change through POST /commands/* (commands.md). */
@Controller('robots')
export class RobotController {
  constructor(
    private readonly service: RobotService,
    private readonly queuedCommandService: QueuedCommandService,
  ) {}

  @Get()
  findAll(@Query('floorId', ParseIntPipe) floorId: number) {
    return this.service.findAll(floorId);
  }

  @Get(':id/queued-commands')
  findQueuedCommands(@Param('id', ParseIntPipe) id: number) {
    return this.queuedCommandService.findByRobot(id);
  }
}
