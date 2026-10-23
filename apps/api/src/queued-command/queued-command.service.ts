import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueuedCommand } from '../../database/entities/index.js';

@Injectable()
export class QueuedCommandService {
  constructor(
    @InjectRepository(QueuedCommand)
    private readonly repo: Repository<QueuedCommand>,
  ) {}

  /** One robot's queue in FIFO order (ascending Id). */
  findByRobot(robotId: number): Promise<QueuedCommand[]> {
    return this.repo.find({
      where: { robot: { id: robotId } },
      order: { id: 'ASC' },
      relations: { robot: true },
    });
  }
}
