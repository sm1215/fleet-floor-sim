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
import { CreateLogEntryDto } from './dto/create-log-entry.dto.js';
import { UpdateLogEntryDto } from './dto/update-log-entry.dto.js';
import { LogEntryService } from './log-entry.service.js';

@Controller('log-entries')
export class LogEntryController {
  constructor(private readonly service: LogEntryService) {}

  @Post()
  create(@Body() dto: CreateLogEntryDto) {
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
    @Body() dto: UpdateLogEntryDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
