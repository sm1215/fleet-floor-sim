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

export const COMMANDS = ['MOVE', 'LEFT', 'RIGHT'] as const;
export type Command = (typeof COMMANDS)[number];
