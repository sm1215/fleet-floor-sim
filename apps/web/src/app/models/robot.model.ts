import { Direction } from './direction';

export interface Robot {
  id: number;
  /** Shown as `R<displayId>`; commands address robots by it. */
  displayId: number;
  direction: Direction;
  cellId: number;
  /** Derived from the robot's cell. */
  readonly x: number;
  /** Derived from the robot's cell. */
  readonly y: number;
}
