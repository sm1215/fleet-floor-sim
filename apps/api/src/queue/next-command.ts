import type { Robot } from '../../database/entities/index.js';
import type { Command, GOTO, Position } from '../shared/types.js';

/**
 * A robot and the command taken from the head of its queue. A GOTO stays
 * queued, so it carries its row id for the Engine to remove it.
 */
export type NextCommand =
  | { robot: Robot; command: Command }
  | {
      robot: Robot;
      command: typeof GOTO;
      queuedCommandId: number;
      target: Position;
    };
