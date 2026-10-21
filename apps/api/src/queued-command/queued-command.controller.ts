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
import { CreateQueuedCommandDto } from './dto/create-queued-command.dto.js';
import { UpdateQueuedCommandDto } from './dto/update-queued-command.dto.js';
import { QueuedCommandService } from './queued-command.service.js';

@Controller('queued-commands')
export class QueuedCommandController {
  constructor(private readonly service: QueuedCommandService) {}

  @Post()
  create(@Body() dto: CreateQueuedCommandDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQueuedCommandDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
