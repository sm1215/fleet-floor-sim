import { DEFAULT_FLOOR_SIZE } from '../floor/floor.model.js';
import {
  COMMANDS,
  type Command,
  type Direction,
  DIRECTION_NAMES,
} from '../shared/types.js';

export type ScenarioCommand =
  | { kind: 'FLOOR'; width: number; height: number }
  | { kind: 'OBSTACLE'; x: number; y: number }
  | {
      kind: 'PLACE';
      displayId: number;
      x: number;
      y: number;
      direction: Direction;
    }
  | { kind: 'QUEUE'; displayId: number; commands: Command[] }
  | { kind: 'TICK'; amount: number }
  | { kind: 'REPORT' };

const toInt = (s: string | undefined): number | null =>
  s !== undefined && /^\d+$/.test(s) ? Number(s) : null;

const toRobotId = (s: string | undefined): number | null => {
  const match = s === undefined ? null : /^R(\d+)$/.exec(s);
  return match ? Number(match[1]) : null;
};

const isCommand = (s: string): s is Command =>
  (COMMANDS as readonly string[]).includes(s);

/** Comma-separated params; null when any part is empty. An empty rest is []. */
function splitParams(rest: string): string[] | null {
  if (rest === '') return [];
  const parts = rest.split(',').map((p) => p.trim());
  return parts.every((p) => p !== '') ? parts : null;
}

/** Ints only; null if any part is not a non-negative int. */
function toInts(parts: string[]): number[] | null {
  const ints = parts.map(toInt);
  return ints.every((n) => n !== null) ? ints : null;
}

/** Splits off the first whitespace-separated token. */
function head(text: string): [string, string] {
  const match = /^(\S+)\s*(.*)$/.exec(text);
  return match ? [match[1], match[2]] : ['', ''];
}

/**
 * Parses one scenario line (scenario-runner.md, File format). Blank, `#`
 * and invalid lines → null.
 */
export function parseLine(line: string): ScenarioCommand | null {
  const text = line.trim().toUpperCase();
  if (text === '' || text.startsWith('#')) return null;
  const [keyword, afterKeyword] = head(text);

  switch (keyword) {
    case 'FLOOR': {
      const parts = splitParams(afterKeyword);
      if (!parts || parts.length > 2) return null;
      const ints = toInts(parts);
      if (!ints) return null;
      const [width = DEFAULT_FLOOR_SIZE, height = DEFAULT_FLOOR_SIZE] = ints;
      return { kind: 'FLOOR', width, height };
    }
    case 'OBSTACLE': {
      const parts = splitParams(afterKeyword);
      const ints = parts?.length === 2 ? toInts(parts) : null;
      return ints ? { kind: 'OBSTACLE', x: ints[0], y: ints[1] } : null;
    }
    case 'TICK': {
      if (afterKeyword === '') return { kind: 'TICK', amount: 1 };
      const amount = toInt(afterKeyword);
      return amount === null ? null : { kind: 'TICK', amount };
    }
    case 'REPORT':
      return afterKeyword === '' ? { kind: 'REPORT' } : null;
  }

  const [rId, rest] = head(afterKeyword);
  const displayId = toRobotId(rId);
  if (displayId === null) return null;

  switch (keyword) {
    case 'PLACE': {
      const parts = splitParams(rest);
      if (parts?.length !== 3) return null;
      const ints = toInts(parts.slice(0, 2));
      const direction = (DIRECTION_NAMES as readonly string[]).indexOf(
        parts[2],
      );
      if (!ints || direction < 0) return null;
      return { kind: 'PLACE', displayId, x: ints[0], y: ints[1], direction };
    }
    case 'QUEUE': {
      const commands = rest === '' ? [] : rest.split(/\s+/);
      if (commands.length === 0 || !commands.every(isCommand)) return null;
      return { kind: 'QUEUE', displayId, commands };
    }
    case 'LEFT':
    case 'RIGHT':
    case 'MOVE':
      return rest === ''
        ? { kind: 'QUEUE', displayId, commands: [keyword] }
        : null;
  }
  return null;
}
