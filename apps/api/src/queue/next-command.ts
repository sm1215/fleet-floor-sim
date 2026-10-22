import type { Robot } from '../../database/entities/index.js';
import type { Command } from '../shared/types.js';

/** A robot and the command taken from the head of its queue. */
export interface NextCommand {
  robot: Robot;
  command: Command;
}
