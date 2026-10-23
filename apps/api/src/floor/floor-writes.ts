import { EntityManager, In } from 'typeorm';
import {
  Cell,
  Floor,
  LogEntry,
  QueuedCommand,
  Robot,
  TickHistory,
} from '../../database/entities/index.js';
import { planResize } from './floor.model.js';

/** Fills a floor with Open cells, row by row from the origin. */
export async function insertOpenCells(
  manager: EntityManager,
  floor: Floor,
): Promise<void> {
  const rows: Partial<Cell>[] = [];
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      rows.push({ obstacle: false, xPosition: x, yPosition: y, floor });
    }
  }
  await manager.getRepository(Cell).insert(rows);
}

/**
 * Resizes the floor, adding/removing cells and moving displaced robots.
 * Returns false, with nothing written, when displaced robots have no room.
 */
export async function resizeFloor(
  manager: EntityManager,
  id: number,
  size: { width: number; height: number },
): Promise<boolean> {
  const cellRepo = manager.getRepository(Cell);
  const robotRepo = manager.getRepository(Robot);
  const cells = await cellRepo.findBy({ floor: { id } });
  const robots = await robotRepo.find({
    where: { cell: { floor: { id } } },
    relations: { cell: true },
  });
  const plan = planResize(
    size,
    cells,
    robots.map((r) => ({ id: r.id, cellId: r.cell.id })),
  );
  if (!plan) return false;

  await manager.getRepository(Floor).save({ id, ...size });
  if (plan.create.length > 0) {
    await cellRepo.insert(
      plan.create.map(({ x, y }) => ({
        obstacle: false,
        xPosition: x,
        yPosition: y,
        floor: { id },
      })),
    );
  }
  for (const { robotId, to } of plan.moves) {
    const target = await cellRepo.findOneByOrFail({
      floor: { id },
      xPosition: to.x,
      yPosition: to.y,
    });
    await robotRepo.update(robotId, { cell: { id: target.id } });
  }
  if (plan.deleteCellIds.length > 0) {
    await cellRepo.delete({ id: In(plan.deleteCellIds) });
  }
  return true;
}

/**
 * Deletes everything on a floor, children first: queued commands, robots,
 * cells, log entries and snapshots. The floor row itself stays.
 */
export async function deleteFloorContents(
  manager: EntityManager,
  id: number,
): Promise<void> {
  const robotRepo = manager.getRepository(Robot);
  const robotIds = (
    await robotRepo.find({
      select: { id: true },
      where: { cell: { floor: { id } } },
    })
  ).map((r) => r.id);
  if (robotIds.length > 0) {
    await manager
      .getRepository(QueuedCommand)
      .delete({ robot: { id: In(robotIds) } });
    await robotRepo.delete({ id: In(robotIds) });
  }
  await manager.getRepository(Cell).delete({ floor: { id } });
  await manager.getRepository(LogEntry).delete({ floor: { id } });
  await manager.getRepository(TickHistory).delete({ floor: { id } });
}
