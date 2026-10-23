import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import {
  Cell,
  Floor,
  LogEntry,
  QueuedCommand,
  Robot,
  TickHistory,
} from '../../database/entities/index.js';
import {
  deleteParams,
  floorParams,
  gotoParams,
  type LogAction,
  obstacleParams,
  placeParams,
  queueParams,
} from '../log-entry/log-params.js';
import { insertOpenCells, resizeFloor } from '../floor/floor-writes.js';
import { MAX_FLOOR_SIZE, RESIZE_NO_ROOM } from '../floor/floor.model.js';
import {
  COMMANDS,
  type Command,
  type Direction,
  GOTO,
} from '../shared/types.js';
import { WriteLock } from '../shared/write-lock.js';
import type { CommandResult, Recorder } from './command-result.js';
import { formatReport } from './report.js';

const ok = (
  floorId: number,
  action: LogAction,
  params: string,
): CommandResult => ({
  ok: true,
  log: { floorId, action, params },
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
 * FLOOR / OBSTACLE / PLACE / QUEUE / GOTO / DELETE / REPORT on the given floor
 * (commands.md, timeline.md); a null floor has no cells or robots. Each
 * success carries its log line (log-entry.md), passed to the optional
 * recorder inside the same transaction.
 */
@Injectable()
export class DirectCommandsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly lock: WriteLock,
  ) {}

  /**
   * Null → creates a floor with Open cells (the log line carries its id).
   * Otherwise resizes that floor.
   */
  async floor(
    floorId: number | null,
    width: number,
    height: number,
    record?: Recorder,
  ): Promise<CommandResult> {
    if (!isSize(width) || !isSize(height)) {
      return ignored(`Floor size must be an int from 1 to ${MAX_FLOOR_SIZE}`);
    }
    return this.command(record, async (manager) => {
      if (floorId === null) {
        const created = await manager
          .getRepository(Floor)
          .save({ width, height });
        await insertOpenCells(manager, created);
        return ok(created.id, 'FLOOR', floorParams(width, height, 'CREATED'));
      }
      if (!(await manager.getRepository(Floor).existsBy({ id: floorId }))) {
        return ignored(`Floor ${floorId} not found`);
      }
      const resized = await resizeFloor(manager, floorId, { width, height });
      return resized
        ? ok(floorId, 'FLOOR', floorParams(width, height, 'RESIZED'))
        : ignored(RESIZE_NO_ROOM);
    });
  }

  /** Toggles the cell at x/y between Open and Obstacle. */
  obstacle(
    floorId: number | null,
    x: number,
    y: number,
    record?: Recorder,
  ): Promise<CommandResult> {
    return this.command(record, async (manager) => {
      const cell = await this.cellAt(manager, floorId, x, y);
      if (!cell) return ignored(`No cell at ${x},${y}`);
      const on = !cell.obstacle;
      if (on && (await this.robotOn(manager, cell.id))) {
        return ignored(`Cell ${x},${y} has a robot`);
      }
      await manager.getRepository(Cell).update(cell.id, { obstacle: on });
      return ok(cell.floor.id, 'OBSTACLE', obstacleParams(x, y, on));
    });
  }

  /**
   * Moves and turns the robot with this displayId, or creates it. Without a
   * displayId, creates a robot with the floor's highest displayId + 1.
   */
  place(
    floorId: number | null,
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
      const cell = await this.cellAt(manager, floorId, x, y);
      if (!cell) return ignored(`No cell at ${x},${y}`);
      if (cell.obstacle) return ignored(`Cell ${x},${y} is an Obstacle`);
      const occupant = await this.robotOn(manager, cell.id);
      if (occupant && occupant.displayId !== displayId) {
        return ignored(`Cell ${x},${y} has robot R${occupant.displayId}`);
      }
      const robots = manager.getRepository(Robot);
      const id =
        displayId ?? (await this.maxDisplayId(manager, cell.floor.id)) + 1;
      const robot = await this.robotById(manager, cell.floor.id, id);
      if (robot) {
        await robots.update(robot.id, { cell: { id: cell.id }, direction });
      } else {
        await robots.insert({
          displayId: id,
          direction,
          cell: { id: cell.id },
        });
      }
      return ok(cell.floor.id, 'PLACE', placeParams(id, x, y, direction));
    });
  }

  /** Enqueues every command in order, or none if any is invalid. */
  async queue(
    floorId: number | null,
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
        const robot = await this.robotById(manager, floorId, displayId);
        if (!robot || floorId === null) return notFound;
        const repo = manager.getRepository(QueuedCommand);
        // One insert per command keeps ids in list order.
        for (const command of commands) {
          await repo.insert({ command, params: null, robot: { id: robot.id } });
        }
        return ok(floorId, 'QUEUE', queueParams(displayId, commands));
      });
    } catch (error) {
      // The robot was deleted outside the lock (e.g. over HTTP) meanwhile.
      if (isForeignKeyViolation(error)) return notFound;
      throw error;
    }
  }

  /**
   * Enqueues GOTO with params `x,y` (pathfinding.md). The target only has to
   * exist: an Obstacle or occupied target is still enqueued.
   */
  async goto(
    floorId: number | null,
    displayId: number,
    x: number,
    y: number,
    record?: Recorder,
  ): Promise<CommandResult> {
    const notFound = ignored(`Robot R${displayId} not found`);
    try {
      return await this.command(record, async (manager) => {
        const robot = await this.robotById(manager, floorId, displayId);
        if (!robot || floorId === null) return notFound;
        if (!(await this.cellAt(manager, floorId, x, y))) {
          return ignored(`No cell at ${x},${y}`);
        }
        await manager.getRepository(QueuedCommand).insert({
          command: GOTO,
          params: `${x},${y}`,
          robot: { id: robot.id },
        });
        return ok(floorId, 'QUEUE', gotoParams(displayId, x, y));
      });
    } catch (error) {
      // The robot was deleted outside the lock (e.g. over HTTP) meanwhile.
      if (isForeignKeyViolation(error)) return notFound;
      throw error;
    }
  }

  /** Removes the robot with this displayId and its queued commands. */
  delete(
    floorId: number | null,
    displayId: number,
    record?: Recorder,
  ): Promise<CommandResult> {
    return this.command(record, async (manager) => {
      const robot = await this.robotById(manager, floorId, displayId);
      if (!robot || floorId === null) {
        return ignored(`Robot R${displayId} not found`);
      }
      await manager
        .getRepository(QueuedCommand)
        .delete({ robot: { id: robot.id } });
      await manager.getRepository(Robot).delete(robot.id);
      return ok(floorId, 'DELETE', deleteParams(displayId));
    });
  }

  /** The shared report over the floor's robots; inside a tick, pass its transaction. */
  async report(
    floorId: number | null,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<string[]> {
    const robots =
      floorId === null
        ? []
        : await manager.getRepository(Robot).find({
            where: { cell: { floor: { id: floorId } } },
            relations: { cell: true },
          });
    return formatReport(
      robots.map((r) => ({
        displayId: r.displayId,
        x: r.cell.xPosition,
        y: r.cell.yPosition,
        direction: r.direction,
      })),
    );
  }

  /** Removes every floor and everything on it, children first. */
  clear(): Promise<void> {
    return this.write(async (manager) => {
      for (const entity of [
        QueuedCommand,
        Robot,
        Cell,
        LogEntry,
        TickHistory,
        Floor,
      ]) {
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

  /** The cell at x/y on the floor, with its floor loaded. */
  private async cellAt(
    manager: EntityManager,
    floorId: number | null,
    x: number,
    y: number,
  ): Promise<Cell | null> {
    if (floorId === null || !isInt(x) || !isInt(y)) return null;
    return manager.getRepository(Cell).findOne({
      where: { floor: { id: floorId }, xPosition: x, yPosition: y },
      relations: { floor: true },
    });
  }

  private robotOn(manager: EntityManager, cellId: number) {
    return manager.getRepository(Robot).findOneBy({ cell: { id: cellId } });
  }

  /** displayId is unique per floor (timeline.md). */
  private robotById(
    manager: EntityManager,
    floorId: number | null,
    displayId: number,
  ): Promise<Robot | null> {
    if (floorId === null) return Promise.resolve(null);
    return manager
      .getRepository(Robot)
      .findOneBy({ displayId, cell: { floor: { id: floorId } } });
  }

  /** The floor's highest displayId, or 0 when it has no robots. */
  private async maxDisplayId(
    manager: EntityManager,
    floorId: number,
  ): Promise<number> {
    const row = await manager
      .getRepository(Robot)
      .createQueryBuilder('robot')
      .innerJoin('robot.cell', 'cell')
      .where('cell.floor_id = :floorId', { floorId })
      .select('MAX(robot.display_id)', 'max')
      .getRawOne<{ max: number | null }>();
    return row?.max ?? 0;
  }
}
