import { Injectable } from '@nestjs/common';
import {
  Between,
  EntityManager,
  LessThanOrEqual,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js';
import {
  Cell,
  Floor,
  LogEntry,
  QueuedCommand,
  Robot,
  TickHistory,
} from '../../database/entities/index.js';
import type { Command } from '../shared/types.js';
import type { FloorState } from './floor-state.js';
import { applyEntry } from './replay.js';

/** Rows per multi-row INSERT; keeps each statement under SQLite's bound-variable limit. */
const INSERT_CHUNK = 500;

/** Inserts rows in order with few statements, so ids ascend in list order. */
async function insertInChunks<T extends ObjectLiteral>(
  repo: Repository<T>,
  rows: QueryDeepPartialEntity<T>[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await repo.insert(rows.slice(i, i + INSERT_CHUNK));
  }
}

/** Snapshots and past states of a floor (timeline.md). */
@Injectable()
export class HistoryService {
  /** The floor as it is in the DB now. */
  async liveState(
    manager: EntityManager,
    floorId: number,
  ): Promise<FloorState> {
    const floor = await manager
      .getRepository(Floor)
      .findOneByOrFail({ id: floorId });
    const cells = await manager.getRepository(Cell).find({
      where: { floor: { id: floorId } },
      order: { yPosition: 'ASC', xPosition: 'ASC' },
    });
    const robots = await manager.getRepository(Robot).find({
      where: { cell: { floor: { id: floorId } } },
      relations: { cell: true },
      order: { displayId: 'ASC' },
    });
    const queued = await manager.getRepository(QueuedCommand).find({
      where: { robot: { cell: { floor: { id: floorId } } } },
      relations: { robot: true },
      order: { id: 'ASC' },
    });
    return {
      width: floor.width,
      height: floor.height,
      cells: cells.map((c) => ({
        x: c.xPosition,
        y: c.yPosition,
        obstacle: c.obstacle,
      })),
      robots: robots.map((r) => ({
        id: r.id,
        displayId: r.displayId,
        x: r.cell.xPosition,
        y: r.cell.yPosition,
        direction: r.direction,
        queue: queued
          .filter((q) => q.robot.id === r.id)
          .map((q) => q.command as Command),
      })),
    };
  }

  /** Saves the live state as the snapshot for `tick`, replacing any earlier one. */
  async snapshot(
    manager: EntityManager,
    floorId: number,
    tick: number,
  ): Promise<void> {
    const state = JSON.stringify(await this.liveState(manager, floorId));
    const repo = manager.getRepository(TickHistory);
    await repo.delete({ floor: { id: floorId }, tick });
    await repo.insert({ floor: { id: floorId }, tick, state });
  }

  /**
   * The floor at `tick`: live at `currentTick`; otherwise the nearest snapshot
   * at or before `tick` plus the log entries after it, up to `tick`. Null when
   * there is no such snapshot.
   */
  async stateAt(
    manager: EntityManager,
    floorId: number,
    tick: number,
    currentTick: number,
  ): Promise<FloorState | null> {
    if (tick === currentTick) return this.liveState(manager, floorId);
    const snapshot = await manager.getRepository(TickHistory).findOne({
      where: { floor: { id: floorId }, tick: LessThanOrEqual(tick) },
      order: { tick: 'DESC' },
    });
    if (!snapshot) return null;
    const entries = await manager.getRepository(LogEntry).find({
      where: { floor: { id: floorId }, tick: Between(snapshot.tick + 1, tick) },
      order: { id: 'ASC' },
    });
    return entries.reduce(applyEntry, JSON.parse(snapshot.state) as FloorState);
  }

  /**
   * Creates a floor holding the source's state at `tick`, with copies of its
   * log entries and snapshots up to `tick`, so their histories match. Returns
   * the new floor id, or null when `stateAt` has no history for that tick.
   */
  async fork(
    manager: EntityManager,
    floorId: number,
    tick: number,
    currentTick: number,
  ): Promise<number | null> {
    const state = await this.stateAt(manager, floorId, tick, currentTick);
    if (!state) return null;
    const floor = await manager
      .getRepository(Floor)
      .save({ width: state.width, height: state.height });
    const cells = await manager.getRepository(Cell).save(
      state.cells.map((c) => ({
        obstacle: c.obstacle,
        xPosition: c.x,
        yPosition: c.y,
        floor,
      })),
    );
    const cellAt = (x: number, y: number) =>
      cells.find((c) => c.xPosition === x && c.yPosition === y)!;
    // In id order, so new ids keep the order resize relies on.
    for (const r of [...state.robots].sort((a, b) => a.id - b.id)) {
      const robot = await manager.getRepository(Robot).save({
        displayId: r.displayId,
        direction: r.direction,
        cell: cellAt(r.x, r.y),
      });
      await insertInChunks(
        manager.getRepository(QueuedCommand),
        r.queue.map((command) => ({ command, params: null, robot })),
      );
    }
    const entries = await manager.getRepository(LogEntry).find({
      where: { floor: { id: floorId }, tick: LessThanOrEqual(tick) },
      order: { id: 'ASC' },
    });
    await insertInChunks(
      manager.getRepository(LogEntry),
      entries.map(({ action, params, result, tick: at }) => ({
        action,
        params,
        result,
        tick: at,
        floor,
      })),
    );
    const snapshots = await manager.getRepository(TickHistory).find({
      where: { floor: { id: floorId }, tick: LessThanOrEqual(tick) },
    });
    await insertInChunks(
      manager.getRepository(TickHistory),
      snapshots.map((s) => ({ tick: s.tick, state: s.state, floor })),
    );
    return floor.id;
  }
}
