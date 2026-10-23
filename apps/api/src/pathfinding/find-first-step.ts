import { Direction, FORWARD, type Position } from '../shared/types.js';

/** Tie-break order for equally short first steps (pathfinding.md). */
const STEP_ORDER = [Direction.N, Direction.E, Direction.S, Direction.W];

const key = ({ x, y }: Position) => `${x},${y}`;

/**
 * The direction of the first step of a shortest path from `start` to
 * `target`, or null when there is no path or `start` is the target. Cells
 * outside the grid are walls without asking `isWall`; `start` is never a wall.
 */
export function findFirstStep(
  start: Position,
  target: Position,
  floor: { width: number; height: number },
  isWall: (position: Position) => boolean,
): Direction | null {
  if (key(start) === key(target)) return null;
  const inside = ({ x, y }: Position) =>
    x >= 0 && y >= 0 && x < floor.width && y < floor.height;
  const open = (p: Position) =>
    inside(p) && (key(p) === key(start) || !isWall(p));
  if (!open(target)) return null;

  // BFS outward from the target: distance to it from every reachable cell.
  const distance = new Map([[key(target), 0]]);
  const frontier = [target];
  for (let i = 0; i < frontier.length; i++) {
    const cell = frontier[i];
    if (key(cell) === key(start)) break;
    for (const direction of STEP_ORDER) {
      const next = {
        x: cell.x + FORWARD[direction].x,
        y: cell.y + FORWARD[direction].y,
      };
      if (distance.has(key(next)) || !open(next)) continue;
      distance.set(key(next), distance.get(key(cell))! + 1);
      frontier.push(next);
    }
  }

  let best: Direction | null = null;
  let bestDistance = Infinity;
  for (const direction of STEP_ORDER) {
    const next = {
      x: start.x + FORWARD[direction].x,
      y: start.y + FORWARD[direction].y,
    };
    const d = distance.get(key(next));
    if (d !== undefined && d < bestDistance) {
      best = direction;
      bestDistance = d;
    }
  }
  return best;
}
