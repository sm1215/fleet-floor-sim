import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LogEntry } from '../../database/entities/index.js';
import { CreateLogEntryDto } from './dto/create-log-entry.dto.js';
import { UpdateLogEntryDto } from './dto/update-log-entry.dto.js';

@Injectable()
export class LogEntryService {
  constructor(
    @InjectRepository(LogEntry) private readonly repo: Repository<LogEntry>,
  ) {}

  create(dto: CreateLogEntryDto): Promise<LogEntry> {
    return this.repo.save(this.repo.create(dto));
  }

  findAll(): Promise<LogEntry[]> {
    return this.repo.find();
  }

  async findOne(id: number): Promise<LogEntry> {
    const entry = await this.repo.findOneBy({ id });
    if (!entry) throw new NotFoundException(`Log entry ${id} not found`);
    return entry;
  }

  async update(id: number, dto: UpdateLogEntryDto): Promise<LogEntry> {
    await this.findOne(id);
    await this.repo.save({ id, ...dto });
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.repo.remove(await this.findOne(id));
  }
}
