import type { Cell } from '../../database/entities/index.js';
import type { Position } from '../shared/types.js';

export function toPosition(
  cell: Pick<Cell, 'xPosition' | 'yPosition'>,
): Position {
  return { x: cell.xPosition, y: cell.yPosition };
}
