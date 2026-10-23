import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import {
  Cell,
  Floor,
  QueuedCommand,
  Robot,
} from '../../database/entities/index.js';
import {
  deleteParams,
  floorParams,
  type LogAction,
  obstacleParams,
  placeParams,
  queueParams,
} from '../log-entry/log-params.js';
import { insertOpenCells, resizeFloor } from '../floor/floor-writes.js';
import { MAX_FLOOR_SIZE, RESIZE_NO_ROOM } from '../floor/floor.model.js';
import { COMMANDS, type Command, type Direction } from '../shared/types.js';
import { WriteLock } from '../shared/write-lock.js';
import type { CommandResult, Recorder } from './command-result.js';
import { formatReport } from './report.js';

const ok = (action: LogAction, params: string): CommandResult => ({
  ok: true,
  log: { action, params },
});
const ignored = (reason: string): CommandResult => ({ ok: false, reason });

const isInt = (n: number) => Number.isInteger(n);
const isSize = (n: number) => isInt(n) && n >= 1 && n <= MAX_FLOOR_SIZE;
const isDirection = (n: number) => isInt(n) && n >= 0 && n <= 3;

const isForeignKeyViolation = (error: unknown) =>
  error instanceof QueryFailedError &&
  (error.driverError as { code?: string }).code ===
    'SQLITE_CONSTRAINT_FOREIGNKEY';

/**
 * FLOOR / OBSTACLE / PLACE / QUEUE / DELETE / REPORT on the single floor
 * (commands.md). Each success carries its log line (log-entry.md), passed to
 * the optional recorder inside the same transaction.
 */
@Injectable()
export class DirectCommandsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly lock: WriteLock,
  ) {}

  /** Creates the floor with Open cells, or resizes the existing one. */
  async floor(
    width: number,
    height: number,
    record?: Recorder,
  ): Promise<CommandResult> {
    if (!isSize(width) || !isSize(height)) {
      return ignored(`Floor size must be an int from 1 to ${MAX_FLOOR_SIZE}`);
    }
    return this.command(record, async (manager) => {
      const floor = await this.currentFloor(manager);
      if (!floor) {
        const created = await manager
          .getRepository(Floor)
          .save({ width, height });
        await insertOpenCells(manager, created);
        return ok('FLOOR', floorParams(width, height, 'CREATED'));
      }
      const resized = await resizeFloor(manager, floor.id, { width, height });
      return resized
        ? ok('FLOOR', floorParams(width, height, 'RESIZED'))
        : ignored(RESIZE_NO_ROOM);
    });
  }

  /** Toggles the cell at x/y between Open and Obstacle. */
  obstacle(x: number, y: number, record?: Recorder): Promise<CommandResult> {
    return this.command(record, async (manager) => {
      const cell = await this.cellAt(manager, x, y);
      if (!cell) return ignored(`No cell at ${x},${y}`);
      const on = !cell.obstacle;
      if (on && (await this.robotOn(manager, cell.id))) {
        return ignored(`Cell ${x},${y} has a robot`);
      }
      await manager.getRepository(Cell).update(cell.id, { obstacle: on });
      return ok('OBSTACLE', obstacleParams(x, y, on));
    });
  }

  /**
   * Moves and turns the robot with this displayId, or creates it. Without a
   * displayId, creates a robot with the highest displayId + 1.
   */
  place(
    displayId: number | undefined,
    x: number,
    y: number,
    direction: Direction,
    record?: Recorder,
  ): Promise<CommandResult> {
    if (!isDirection(direction)) {
      return Promise.resolve(ignored('Direction must be 0 (N) to 3 (W)'));
    }
    return this.command(record, async (manager) => {
      const cell = await this.cellAt(manager, x, y);
      if (!cell) return ignored(`No cell at ${x},${y}`);
      if (cell.obstacle) return ignored(`Cell ${x},${y} is an Obstacle`);
      const occupant = await this.robotOn(manager, cell.id);
      if (occupant && occupant.displayId !== displayId) {
        return ignored(`Cell ${x},${y} has robot R${occupant.displayId}`);
      }
      const robots = manager.getRepository(Robot);
      const id = displayId ?? ((await robots.maximum('displayId')) ?? 0) + 1;
      const robot = await robots.findOneBy({ displayId: id });
      if (robot) {
        await robots.update(robot.id, { cell: { id: cell.id }, direction });
      } else {
        await robots.insert({
          displayId: id,
          direction,
          cell: { id: cell.id },
        });
      }
      return ok('PLACE', placeParams(id, x, y, direction));
    });
  }

  /** Enqueues every command in order, or none if any is invalid. */
  async queue(
    displayId: number,
    commands: Command[],
    record?: Recorder,
  ): Promise<CommandResult> {
    if (commands.length === 0) return ignored('No commands to queue');
    if (!commands.every((c) => COMMANDS.includes(c))) {
      return ignored(`Commands must be one of ${COMMANDS.join(', ')}`);
    }
    const notFound = ignored(`Robot R${displayId} not found`);
    try {
      return await this.command(record, async (manager) => {
        const robot = await manager
          .getRepository(Robot)
          .findOneBy({ displayId });
        if (!robot) return notFound;
        const repo = manager.getRepository(QueuedCommand);
        // One insert per command keeps ids in list order.
        for (const command of commands) {
          await repo.insert({ command, params: null, robot: { id: robot.id } });
        }
        return ok('QUEUE', queueParams(displayId, commands));
      });
    } catch (error) {
      // The robot was deleted outside the lock (e.g. over HTTP) meanwhile.
      if (isForeignKeyViolation(error)) return notFound;
      throw error;
    }
  }

  /** Removes the robot with this displayId and its queued commands. */
  delete(displayId: number, record?: Recorder): Promise<CommandResult> {
    return this.command(record, async (manager) => {
      const robot = await manager.getRepository(Robot).findOneBy({ displayId });
      if (!robot) return ignored(`Robot R${displayId} not found`);
      await manager
        .getRepository(QueuedCommand)
        .delete({ robot: { id: robot.id } });
      await manager.getRepository(Robot).delete(robot.id);
      return ok('DELETE', deleteParams(displayId));
    });
  }

  /** The shared report over every robot; inside a tick, pass its transaction. */
  async report(
    manager: EntityManager = this.dataSource.manager,
  ): Promise<string[]> {
    const robots = await manager
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

  /** Runs a command and records its log line in the same transaction. */
  private command(
    record: Recorder | undefined,
    work: (manager: EntityManager) => Promise<CommandResult>,
  ): Promise<CommandResult> {
    return this.write(async (manager) => {
      const result = await work(manager);
      if (result.ok && result.log && record) await record(manager, result.log);
      return result;
    });
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
