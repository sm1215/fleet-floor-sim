import { type Command, Direction, DIRECTION_NAMES } from '../shared/types.js';

export type LogAction =
  'PLACE' | 'OBSTACLE' | 'QUEUE' | 'DELETE' | 'FLOOR' | 'TICK';

/** A log entry's floor, action and params text; the result is added when written. */
export interface LogLine {
  floorId: number;
  action: LogAction;
  params: string;
}

export function placeParams(
  displayId: number,
  x: number,
  y: number,
  direction: Direction,
): string {
  return `R${displayId} ${x}, ${y}, ${DIRECTION_NAMES[direction]}`;
}

export function obstacleParams(x: number, y: number, on: boolean): string {
  return `${x}, ${y}, ${on ? 'ON' : 'OFF'}`;
}

export function queueParams(displayId: number, commands: Command[]): string {
  return `R${displayId} ${commands.join(' ')}`;
}

export function deleteParams(displayId: number): string {
  return `R${displayId}`;
}

export function floorParams(
  width: number,
  height: number,
  change: 'CREATED' | 'RESIZED',
): string {
  return `${width}, ${height}, ${change}`;
}
