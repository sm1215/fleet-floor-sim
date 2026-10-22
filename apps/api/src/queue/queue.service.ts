import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueuedCommand, Robot } from '../../database/entities/index.js';
import { COMMANDS, type Command } from '../shared/types.js';
import type { NextCommand } from './next-command.js';

function parseCommand(value: string): Command | null {
  return (COMMANDS as readonly string[]).includes(value)
    ? (value as Command)
    : null;
}

@Injectable()
export class QueueService {
  constructor(
    @InjectRepository(Robot) private readonly robots: Repository<Robot>,
    @InjectRepository(QueuedCommand)
    private readonly commands: Repository<QueuedCommand>,
  ) {}

  /**
   * One promise per robot, in ascending displayId order. Each takes the
   * robot's head command (deleted whether or not it parses) and resolves to
   * it, or to null when the queue is empty or the command does not parse.
   * Commands are not executed here.
   */
  async doNext(): Promise<Promise<NextCommand | null>[]> {
    const robots = await this.robots.find({
      order: { displayId: 'ASC' },
      relations: { cell: true },
    });
    return robots.map((robot) => this.takeNext(robot));
  }

  private async takeNext(robot: Robot): Promise<NextCommand | null> {
    const head = await this.commands.findOne({
      where: { robot: { id: robot.id } },
      order: { id: 'ASC' },
    });
    if (!head) return null;
    await this.commands.delete(head.id);
    const command = parseCommand(head.command);
    return command ? { robot, command } : null;
  }
}
