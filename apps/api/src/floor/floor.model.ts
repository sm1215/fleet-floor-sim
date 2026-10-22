import type { Cell, Floor } from '../../database/entities/index.js';
import type { Position } from '../shared/types.js';
import { toPosition } from '../cell/cell.model.js';

export function inBounds(
  floor: Pick<Floor, 'width' | 'height'>,
  pos: Position,
): boolean {
  return (
    pos.x >= 0 && pos.y >= 0 && pos.x < floor.width && pos.y < floor.height
  );
}

export function isObstacle(
  cells: Pick<Cell, 'obstacle' | 'xPosition' | 'yPosition'>[],
  pos: Position,
): boolean {
  return cells.some(
    (c) => c.obstacle && c.xPosition === pos.x && c.yPosition === pos.y,
  );
}

export const RESIZE_NO_ROOM =
  "Can't resize grid, not enough space for existing robots";

type PlanCell = Pick<Cell, 'id' | 'obstacle' | 'xPosition' | 'yPosition'>;

export interface ResizePlan {
  create: Position[];
  deleteCellIds: number[];
  /** Target is a position: it may be a cell that `create` adds. */
  moves: { robotId: number; to: Position }[];
}

// Returns null when a displaced robot has no free Open cell to move to.
export function planResize(
  size: Pick<Floor, 'width' | 'height'>,
  cells: PlanCell[],
  robots: { id: number; cellId: number }[],
): ResizePlan | null {
  const key = (p: Position) => `${p.x},${p.y}`;
  const isIn = (c: PlanCell) => inBounds(size, toPosition(c));
  const kept = cells.filter(isIn);
  const deleted = cells.filter((c) => !isIn(c));
  const deleteCellIds = deleted.map((c) => c.id);

  const keptKeys = new Set(kept.map((c) => key(toPosition(c))));
  const create: Position[] = [];
  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) {
      if (!keptKeys.has(key({ x, y }))) create.push({ x, y });
    }
  }

  // Free Open cells inside the new bounds; new cells are always Open and empty.
  const cellById = new Map(cells.map((c) => [c.id, c]));
  const displaced = robots
    .filter((r) => deleteCellIds.includes(r.cellId))
    .sort((a, b) => a.id - b.id);
  const occupied = new Set(
    robots
      .filter((r) => !displaced.includes(r))
      .map((r) => key(toPosition(cellById.get(r.cellId)!))),
  );
  const candidates = [
    ...kept.filter((c) => !c.obstacle).map(toPosition),
    ...create,
  ];

  const moves: ResizePlan['moves'] = [];
  for (const robot of displaced) {
    const from = toPosition(cellById.get(robot.cellId)!);
    const distance = (p: Position) =>
      Math.abs(p.x - from.x) + Math.abs(p.y - from.y);
    const target = candidates
      .filter((p) => !occupied.has(key(p)))
      .sort((a, b) => distance(a) - distance(b) || a.y - b.y || a.x - b.x)[0];
    if (!target) return null;
    occupied.add(key(target));
    moves.push({ robotId: robot.id, to: target });
  }

  return { create, deleteCellIds, moves };
}

/** Width and height of a new or reset floor. */
export const DEFAULT_FLOOR_SIZE = 5;
