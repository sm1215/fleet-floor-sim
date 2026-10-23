import { Direction } from './direction';
import { CommandName } from './queued-command.model';

/** A floor at one tick, as `GET /floors/:id/history` returns it (timeline.md). */
export interface FloorState {
  width: number;
  height: number;
  /** Sorted by y then x. */
  cells: { x: number; y: number; obstacle: boolean }[];
  /** Sorted by displayId; each queue in FIFO order. */
  robots: {
    id: number;
    displayId: number;
    x: number;
    y: number;
    direction: Direction;
    queue: CommandName[];
  }[];
}
