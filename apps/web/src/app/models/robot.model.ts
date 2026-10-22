import { Direction } from './direction';

export interface Robot {
  id: number;
  direction: Direction;
  cellId: number;
  /** Derived from the robot's cell. */
  readonly x: number;
  /** Derived from the robot's cell. */
  readonly y: number;
}
