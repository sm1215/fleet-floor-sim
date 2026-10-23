import type { Command, Direction } from '../shared/types.js';

/**
 * A floor and everything on it at one tick (timeline.md). Stored as JSON in
 * `tick_history` and rebuilt by replay. Cells are sorted by y then x; robots
 * by displayId; each queue is in FIFO order.
 */
export interface FloorState {
  width: number;
  height: number;
  cells: { x: number; y: number; obstacle: boolean }[];
  robots: {
    /** The robot's id; resize moves displaced robots in id order. */
    id: number;
    displayId: number;
    x: number;
    y: number;
    direction: Direction;
    queue: Command[];
  }[];
}
