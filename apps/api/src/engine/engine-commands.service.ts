import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { Cell, Floor, Robot } from '../../database/entities/index.js';
import { findFirstStep } from '../pathfinding/find-first-step.js';
import { FORWARD, type Position } from '../shared/types.js';
import { resolveMoves, type MoveBlock } from './resolve-moves.js';

/** One tick of a GOTO (pathfinding.md). */
export type GotoStep =
  { kind: 'ARRIVED' } | { kind: 'NO_PATH' } | { kind: 'MOVE'; next: Position };

/**
 * Applies LEFT / RIGHT / MOVE / GOTO to the DB during a tick (commands.md, Tick
 * execution). Pass the tick's transaction so the whole tick commits together.
 */
@Injectable()
export class EngineCommandsService {
  constructor(private readonly dataSource: DataSource) {}

  /** Rotates counter-clockwise in place: (d + 3) % 4. */
  async left(robotId: number, manager?: EntityManager): Promise<void> {
    await this.turn(robotId, 3, manager ?? this.dataSource.manager);
  }

  /** Rotates clockwise in place: (d + 1) % 4. */
  async right(robotId: number, manager?: EntityManager): Promise<void> {
    await this.turn(robotId, 1, manager ?? this.dataSource.manager);
  }

  /**
   * Plans one tick of every GOTO on the floor, in the order given. Reads the
   * floor once: walls are Obstacles and every other robot's cell at the start
   * of the tick. A robot not on its target faces the first step of a shortest
   * path (a free turn, persisted) and gets the cell it leads to, for `moveAll`.
   */
  async gotoSteps(
    floorId: number,
    gotos: { robotId: number; target: Position }[],
    manager: EntityManager,
  ): Promise<GotoStep[]> {
    const floor = await manager.findOneByOrFail(Floor, { id: floorId });
    const cells = await manager.find(Cell, {
      where: { floor: { id: floorId }, obstacle: true },
    });
    const robots = await manager.find(Robot, {
      where: { cell: { floor: { id: floorId } } },
      relations: { cell: true },
    });
    const key = ({ x, y }: Position) => `${x},${y}`;
    const obstacles = new Set(
      cells.map((cell) => key({ x: cell.xPosition, y: cell.yPosition })),
    );
    const at = new Map(
      robots.map((robot) => [
        robot.id,
        { x: robot.cell.xPosition, y: robot.cell.yPosition },
      ]),
    );
    const occupied = new Map([...at].map(([id, p]) => [key(p), id]));
    const steps: GotoStep[] = [];
    for (const { robotId, target } of gotos) {
      const start = at.get(robotId)!;
      if (key(start) === key(target)) {
        steps.push({ kind: 'ARRIVED' });
        continue;
      }
      const isWall = (p: Position) =>
        obstacles.has(key(p)) || occupied.has(key(p));
      const direction = findFirstStep(start, target, floor, isWall);
      if (direction === null) {
        steps.push({ kind: 'NO_PATH' });
        continue;
      }
      await manager.update(Robot, robotId, { direction });
      const step = FORWARD[direction];
      steps.push({
        kind: 'MOVE',
        next: { x: start.x + step.x, y: start.y + step.y },
      });
    }
    return steps;
  }

  /** Resolves every MOVE of the tick together and persists the new cells. */
  async moveAll(
    robotIds: number[],
    manager?: EntityManager,
  ): Promise<MoveBlock[]> {
    if (robotIds.length === 0) return [];
    if (manager) return this.resolveAndMove(robotIds, manager);
    return this.dataSource.transaction((m) => this.resolveAndMove(robotIds, m));
  }

  private async resolveAndMove(
    robotIds: number[],
    manager: EntityManager,
  ): Promise<MoveBlock[]> {
    const moverIds = new Set(robotIds);
    const movers = await manager.find(Robot, {
      where: { id: In(robotIds) },
      relations: { cell: { floor: true } },
    });
    const blocked: MoveBlock[] = [];
    // Moves are resolved per floor.
    const floorIds = new Set(movers.map((robot) => robot.cell.floor.id));
    for (const floorId of floorIds) {
      const floor = movers.find((r) => r.cell.floor.id === floorId)!.cell.floor;
      const cells = await manager.find(Cell, {
        where: { floor: { id: floorId } },
      });
      const robots = await manager.find(Robot, {
        where: { cell: { floor: { id: floorId } } },
        relations: { cell: true },
      });
      const cellAt = new Map(
        cells.map((cell) => [`${cell.xPosition},${cell.yPosition}`, cell]),
      );
      const result = resolveMoves(
        robots.map((robot) => ({
          id: robot.id,
          displayId: robot.displayId,
          direction: robot.direction,
          x: robot.cell.xPosition,
          y: robot.cell.yPosition,
        })),
        moverIds,
        floor,
        ({ x, y }) => cellAt.get(`${x},${y}`)?.obstacle ?? false,
      );
      for (const [id, { x, y }] of result.moved) {
        await manager.update(Robot, id, { cell: cellAt.get(`${x},${y}`)! });
      }
      blocked.push(...result.blocked);
    }
    return blocked;
  }

  private async turn(
    robotId: number,
    quarterTurns: number,
    manager: EntityManager,
  ): Promise<void> {
    const robots = manager.getRepository(Robot);
    const robot = await robots.findOneByOrFail({ id: robotId });
    await robots.update(robotId, {
      direction: (robot.direction + quarterTurns) % 4,
    });
  }
}
