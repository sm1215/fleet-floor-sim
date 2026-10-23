// Origin is bottom-left; N is +y.
export enum Direction {
  N = 0,
  E = 1,
  S = 2,
  W = 3,
}

export interface Position {
  x: number;
  y: number;
}

/** One step forward in each direction. */
export const FORWARD: Record<Direction, Position> = {
  [Direction.N]: { x: 0, y: 1 },
  [Direction.E]: { x: 1, y: 0 },
  [Direction.S]: { x: 0, y: -1 },
  [Direction.W]: { x: -1, y: 0 },
};

export const COMMANDS = ['MOVE', 'LEFT', 'RIGHT'] as const;
export type Command = (typeof COMMANDS)[number];

/** Pathfinding command (pathfinding.md); not a QUEUE command. */
export const GOTO = 'GOTO';
export type QueueItemName = Command | typeof GOTO;

/** Uppercase direction names; the index is the `Direction` value. */
export const DIRECTION_NAMES = ['NORTH', 'EAST', 'SOUTH', 'WEST'] as const;
