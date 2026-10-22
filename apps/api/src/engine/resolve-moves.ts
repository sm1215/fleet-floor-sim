import { Direction, type Position } from '../shared/types.js';

export interface PlacedRobot extends Position {
  id: number;
  displayId: number;
  direction: Direction;
}

export interface MoveBlock {
  robotId: number;
  reason: string;
}

export interface MoveResult {
  /** New position of every robot that moves. */
  moved: Map<number, Position>;
  /** One entry per blocked MOVE, in displayId order. */
  blocked: MoveBlock[];
}

export const BLOCKED_BY_WALL = 'Blocked by wall';
export const BLOCKED_BY_OBSTACLE = 'Blocked by obstacle';

export function blockedByRobot(robot: Pick<PlacedRobot, 'displayId'>): string {
  return `Blocked by "R${robot.displayId}"`;
}

const FORWARD: Record<Direction, Position> = {
  [Direction.N]: { x: 0, y: 1 },
  [Direction.E]: { x: 1, y: 0 },
  [Direction.S]: { x: 0, y: -1 },
  [Direction.W]: { x: -1, y: 0 },
};

const key = ({ x, y }: Position) => `${x},${y}`;

/**
 * Resolves every MOVE of one tick together (commands.md, MOVE resolution).
 * `robots` are all robots on the floor; `moverIds` are the ones moving.
 */
export function resolveMoves(
  robots: PlacedRobot[],
  moverIds: Set<number>,
  floor: { width: number; height: number },
  isObstacle: (position: Position) => boolean,
): MoveResult {
  const occupant = new Map(robots.map((robot) => [key(robot), robot]));
  const movers = robots
    .filter((robot) => moverIds.has(robot.id))
    .sort((a, b) => a.displayId - b.displayId);
  const targets = new Map<number, Position>();
  const blocked = new Map<number, string>();

  // 1-2: wall, then obstacle.
  for (const robot of movers) {
    const step = FORWARD[robot.direction];
    const target = { x: robot.x + step.x, y: robot.y + step.y };
    const outside =
      target.x < 0 ||
      target.y < 0 ||
      target.x >= floor.width ||
      target.y >= floor.height;
    if (outside) blocked.set(robot.id, BLOCKED_BY_WALL);
    else if (isObstacle(target)) blocked.set(robot.id, BLOCKED_BY_OBSTACLE);
    else targets.set(robot.id, target);
  }

  // 3: same target, lowest displayId wins (movers are sorted).
  const winners = new Map<string, PlacedRobot>();
  for (const robot of movers) {
    const target = targets.get(robot.id);
    if (!target || blocked.has(robot.id)) continue;
    const winner = winners.get(key(target));
    if (winner) blocked.set(robot.id, blockedByRobot(winner));
    else winners.set(key(target), robot);
  }

  // 4: swaps. Found first, then applied, so both robots of a pair are blocked.
  const swaps: [PlacedRobot, PlacedRobot][] = [];
  for (const robot of movers) {
    const target = targets.get(robot.id);
    const other = target && occupant.get(key(target));
    const back = other && targets.get(other.id);
    if (other && back && key(back) === key(robot)) swaps.push([robot, other]);
  }
  for (const [robot, other] of swaps) {
    if (!blocked.has(robot.id)) blocked.set(robot.id, blockedByRobot(other));
  }

  // 5-6: an occupied target frees up only if its occupant moves out.
  // Reaching a robot that is still being resolved means a closed cycle: all move.
  const resolving = new Set<number>();
  const done = new Map<number, boolean>();
  const moves = (robot: PlacedRobot): boolean => {
    const target = targets.get(robot.id);
    if (!target || blocked.has(robot.id)) return false;
    if (resolving.has(robot.id)) return true;
    const known = done.get(robot.id);
    if (known !== undefined) return known;
    resolving.add(robot.id);
    const other = occupant.get(key(target));
    const ok = !other || moves(other);
    if (!ok) blocked.set(robot.id, blockedByRobot(other));
    resolving.delete(robot.id);
    done.set(robot.id, ok);
    return ok;
  };

  const moved = new Map<number, Position>();
  for (const robot of movers) {
    if (moves(robot)) moved.set(robot.id, targets.get(robot.id)!);
  }
  return {
    moved,
    blocked: movers
      .filter((robot) => blocked.has(robot.id))
      .map((robot) => ({ robotId: robot.id, reason: blocked.get(robot.id)! })),
  };
}
