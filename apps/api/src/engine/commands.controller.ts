import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';
import { DEFAULT_FLOOR_SIZE } from '../floor/floor.model.js';
import { DIRECTION_NAMES } from '../shared/types.js';
import type { CommandResult } from './command-result.js';
import { DeleteCommandDto } from './dto/delete-command.dto.js';
import { FloorCommandDto } from './dto/floor-command.dto.js';
import { ObstacleCommandDto } from './dto/obstacle-command.dto.js';
import { PlaceCommandDto } from './dto/place-command.dto.js';
import { QueueCommandDto } from './dto/queue-command.dto.js';
import { parseRId } from './dto/rid.js';
import { EngineService } from './engine.service.js';

/** Ignored commands → 400 with the reason (commands.md). */
async function respond(command: Promise<CommandResult>) {
  const result = await command;
  if (!result.ok) throw new BadRequestException(result.reason);
  return { ok: true };
}

@Controller('commands')
export class CommandsController {
  constructor(private readonly engine: EngineService) {}

  @Post('floor')
  @HttpCode(200)
  floor(@Body() dto: FloorCommandDto) {
    const { width = DEFAULT_FLOOR_SIZE, height = DEFAULT_FLOOR_SIZE } = dto;
    return respond(this.engine.floor(width, height));
  }

  @Post('obstacle')
  @HttpCode(200)
  obstacle(@Body() dto: ObstacleCommandDto) {
    return respond(this.engine.obstacle(dto.x, dto.y));
  }

  @Post('place')
  @HttpCode(200)
  place(@Body() dto: PlaceCommandDto) {
    const displayId = dto.rId === undefined ? undefined : parseRId(dto.rId);
    const direction = DIRECTION_NAMES.indexOf(dto.direction);
    return respond(this.engine.place(displayId, dto.x, dto.y, direction));
  }

  @Post('queue')
  @HttpCode(200)
  queue(@Body() dto: QueueCommandDto) {
    return respond(this.engine.queue(parseRId(dto.rId), dto.commands));
  }

  @Post('delete')
  @HttpCode(200)
  delete(@Body() dto: DeleteCommandDto) {
    return respond(this.engine.delete(parseRId(dto.rId)));
  }
}
