import type { Cell, Floor } from '../../database/entities/index.js';
import type { Position } from '../shared/types.js';

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
