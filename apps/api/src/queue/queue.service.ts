import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { QueuedCommand, Robot } from '../../database/entities/index.js';
import {
  COMMANDS,
  type Command,
  GOTO,
  type Position,
} from '../shared/types.js';
import type { NextCommand } from './next-command.js';

function parseCommand(value: string): Command | null {
  return (COMMANDS as readonly string[]).includes(value)
    ? (value as Command)
    : null;
}

/** GOTO params `x,y` (non-negative ints) → the target, else null. */
export function parseGotoParams(params: string | null): Position | null {
  const match = params?.match(/^(\d+),(\d+)$/);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

@Injectable()
export class QueueService {
  constructor(
    @InjectRepository(Robot) private readonly robots: Repository<Robot>,
    @InjectRepository(QueuedCommand)
    private readonly commands: Repository<QueuedCommand>,
  ) {}

  /**
   * One promise per robot on the floor, in ascending displayId order. Each takes the
   * robot's head command (deleted whether or not it parses) and resolves to
   * it, or to null when the queue is empty or the command does not parse.
   * A valid GOTO head is returned but not deleted: it stays at the head until
   * the Engine removes it. Commands are not executed here. Inside a tick, pass
   * its transaction.
   */
  async doNext(
    floorId: number,
    manager?: EntityManager,
  ): Promise<Promise<NextCommand | null>[]> {
    const robots = manager?.getRepository(Robot) ?? this.robots;
    const commands = manager?.getRepository(QueuedCommand) ?? this.commands;
    const all = await robots.find({
      where: { cell: { floor: { id: floorId } } },
      order: { displayId: 'ASC' },
      relations: { cell: true },
    });
    // One robot at a time. After a failure the rest reject without touching
    // the DB, so nothing is deleted once a tick's transaction rolls back.
    let previous: Promise<unknown> = Promise.resolve();
    return all.map((robot) => {
      const next = previous.then(() => this.takeNext(commands, robot));
      previous = next;
      return next;
    });
  }

  /** Deletes one queued command (the Engine removes a finished GOTO). */
  async remove(queuedCommandId: number, manager: EntityManager): Promise<void> {
    await manager.getRepository(QueuedCommand).delete(queuedCommandId);
  }

  private async takeNext(
    commands: Repository<QueuedCommand>,
    robot: Robot,
  ): Promise<NextCommand | null> {
    const head = await commands.findOne({
      where: { robot: { id: robot.id } },
      order: { id: 'ASC' },
    });
    if (!head) return null;
    if (head.command === GOTO) {
      const target = parseGotoParams(head.params);
      if (target) {
        return { robot, command: GOTO, queuedCommandId: head.id, target };
      }
    }
    await commands.delete(head.id);
    const command = parseCommand(head.command);
    return command ? { robot, command } : null;
  }
}
