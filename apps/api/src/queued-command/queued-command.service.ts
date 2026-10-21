import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueuedCommand } from '../../database/entities/index.js';
import { CreateQueuedCommandDto } from './dto/create-queued-command.dto.js';
import { UpdateQueuedCommandDto } from './dto/update-queued-command.dto.js';

@Injectable()
export class QueuedCommandService {
  constructor(
    @InjectRepository(QueuedCommand)
    private readonly repo: Repository<QueuedCommand>,
  ) {}

  create({
    robotId,
    ...fields
  }: CreateQueuedCommandDto): Promise<QueuedCommand> {
    return this.repo.save(
      this.repo.create({ ...fields, robot: { id: robotId } }),
    );
  }

  findAll(): Promise<QueuedCommand[]> {
    return this.repo.find({ relations: { robot: true } });
  }

  async findOne(id: number): Promise<QueuedCommand> {
    const row = await this.repo.findOne({
      where: { id },
      relations: { robot: true },
    });
    if (!row) throw new NotFoundException(`Queued command ${id} not found`);
    return row;
  }

  async update(
    id: number,
    { robotId, ...fields }: UpdateQueuedCommandDto,
  ): Promise<QueuedCommand> {
    await this.findOne(id);
    await this.repo.save({
      id,
      ...fields,
      ...(robotId === undefined ? {} : { robot: { id: robotId } }),
    });
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.repo.remove(await this.findOne(id));
  }
}
