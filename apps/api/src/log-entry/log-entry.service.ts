import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { LogEntry } from '../../database/entities/index.js';

export type NewLogEntry = Pick<LogEntry, 'action' | 'params' | 'result'>;

@Injectable()
export class LogEntryService {
  constructor(
    @InjectRepository(LogEntry) private readonly repo: Repository<LogEntry>,
  ) {}

  /** Pass a transaction's manager to write the entry inside it. */
  create(entry: NewLogEntry, manager?: EntityManager): Promise<LogEntry> {
    const repo = manager?.getRepository(LogEntry) ?? this.repo;
    return repo.save(repo.create(entry));
  }

  findAll(): Promise<LogEntry[]> {
    return this.repo.find({ order: { id: 'ASC' } });
  }
}
