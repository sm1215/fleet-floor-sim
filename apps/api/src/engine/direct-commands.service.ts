import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import {
  Cell,
  Floor,
  QueuedCommand,
  Robot,
} from '../../database/entities/index.js';
import { insertOpenCells, resizeFloor } from '../floor/floor-writes.js';
import { MAX_FLOOR_SIZE, RESIZE_NO_ROOM } from '../floor/floor.model.js';
import { COMMANDS, type Command, type Direction } from '../shared/types.js';
import { WriteLock } from '../shared/write-lock.js';
import type { CommandResult } from './command-result.js';
import { formatReport } from './report.js';

const OK: CommandResult = { ok: true };
const ignored = (reason: string): CommandResult => ({ ok: false, reason });

const isInt = (n: number) => Number.isInteger(n);
const isSize = (n: number) => isInt(n) && n >= 1 && n <= MAX_FLOOR_SIZE;
const isDirection = (n: number) => isInt(n) && n >= 0 && n <= 3;

const isForeignKeyViolation = (error: unknown) =>
  error instanceof QueryFailedError &&
  (error.driverError as { code?: string }).code ===
    'SQLITE_CONSTRAINT_FOREIGNKEY';

/** FLOOR / OBSTACLE / PLACE / QUEUE / REPORT on the single floor (commands.md). */
@Injectable()
export class DirectCommandsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly lock: WriteLock,
  ) {}

  /** Creates the floor with Open cells, or resizes the existing one. */
  async floor(width: number, height: number): Promise<CommandResult> {
    if (!isSize(width) || !isSize(height)) {
      return ignored(`Floor size must be an int from 1 to ${MAX_FLOOR_SIZE}`);
    }
    return this.write(async (manager) => {
      const floor = await this.currentFloor(manager);
      if (!floor) {
        const created = await manager
          .getRepository(Floor)
          .save({ width, height });
        await insertOpenCells(manager, created);
        return OK;
      }
      const resized = await resizeFloor(manager, floor.id, { width, height });
      return resized ? OK : ignored(RESIZE_NO_ROOM);
    });
  }

  /** Marks the cell at x/y as an Obstacle. */
  obstacle(x: number, y: number): Promise<CommandResult> {
    return this.write(async (manager) => {
      const cell = await this.cellAt(manager, x, y);
      if (!cell) return ignored(`No cell at ${x},${y}`);
      if (await this.robotOn(manager, cell.id)) {
        return ignored(`Cell ${x},${y} has a robot`);
      }
      await manager.getRepository(Cell).update(cell.id, { obstacle: true });
      return OK;
    });
  }

  /** Moves and turns the robot with this displayId, or creates it. */
  place(
    displayId: number,
    x: number,
    y: number,
    direction: Direction,
  ): Promise<CommandResult> {
    if (!isDirection(direction)) {
      return Promise.resolve(ignored('Direction must be 0 (N) to 3 (W)'));
    }
    return this.write(async (manager) => {
      const cell = await this.cellAt(manager, x, y);
      if (!cell) return ignored(`No cell at ${x},${y}`);
      if (cell.obstacle) return ignored(`Cell ${x},${y} is an Obstacle`);
      const occupant = await this.robotOn(manager, cell.id);
      if (occupant && occupant.displayId !== displayId) {
        return ignored(`Cell ${x},${y} has robot R${occupant.displayId}`);
      }
      const robots = manager.getRepository(Robot);
      const robot = await robots.findOneBy({ displayId });
      if (robot) {
        await robots.update(robot.id, { cell: { id: cell.id }, direction });
      } else {
        await robots.insert({ displayId, direction, cell: { id: cell.id } });
      }
      return OK;
    });
  }

  /** Enqueues every command in order, or none if any is invalid. */
  async queue(displayId: number, commands: Command[]): Promise<CommandResult> {
    if (commands.length === 0) return ignored('No commands to queue');
    if (!commands.every((c) => COMMANDS.includes(c))) {
      return ignored(`Commands must be one of ${COMMANDS.join(', ')}`);
    }
    const notFound = ignored(`Robot R${displayId} not found`);
    try {
      return await this.write(async (manager) => {
        const robot = await manager
          .getRepository(Robot)
          .findOneBy({ displayId });
        if (!robot) return notFound;
        const repo = manager.getRepository(QueuedCommand);
        // One insert per command keeps ids in list order.
        for (const command of commands) {
          await repo.insert({ command, params: null, robot: { id: robot.id } });
        }
        return OK;
      });
    } catch (error) {
      // The robot was deleted outside the lock (e.g. over HTTP) meanwhile.
      if (isForeignKeyViolation(error)) return notFound;
      throw error;
    }
  }

  /** The shared report over every robot. */
  async report(): Promise<string[]> {
    const robots = await this.dataSource
      .getRepository(Robot)
      .find({ relations: { cell: true } });
    return formatReport(
      robots.map((r) => ({
        displayId: r.displayId,
        x: r.cell.xPosition,
        y: r.cell.yPosition,
        direction: r.direction,
      })),
    );
  }

  /** Removes the floor and everything on it, children first. */
  clear(): Promise<void> {
    return this.write(async (manager) => {
      for (const entity of [QueuedCommand, Robot, Cell, Floor]) {
        await manager
          .getRepository(entity)
          .createQueryBuilder()
          .delete()
          .execute();
      }
    });
  }

  /** One transaction, run under the write lock. */
  private write<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.lock.run(() => this.dataSource.transaction(work));
  }

  /** Only one floor exists at a time (log-entry.md). */
  private currentFloor(manager: EntityManager): Promise<Floor | null> {
    return manager
      .getRepository(Floor)
      .findOne({ where: {}, order: { id: 'ASC' } });
  }

  private async cellAt(
    manager: EntityManager,
    x: number,
    y: number,
  ): Promise<Cell | null> {
    if (!isInt(x) || !isInt(y)) return null;
    const floor = await this.currentFloor(manager);
    if (!floor) return null;
    return manager
      .getRepository(Cell)
      .findOneBy({ floor: { id: floor.id }, xPosition: x, yPosition: y });
  }

  private robotOn(manager: EntityManager, cellId: number) {
    return manager.getRepository(Robot).findOneBy({ cell: { id: cellId } });
  }
}
