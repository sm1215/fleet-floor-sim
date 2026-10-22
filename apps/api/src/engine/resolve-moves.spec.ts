import { Direction, type Position } from '../shared/types.js';
import {
  BLOCKED_BY_OBSTACLE,
  BLOCKED_BY_WALL,
  resolveMoves,
  type PlacedRobot,
} from './resolve-moves.js';

const floor = { width: 5, height: 5 };
const noObstacles = () => false;

function robot(
  id: number,
  x: number,
  y: number,
  direction: Direction,
  displayId = id,
): PlacedRobot {
  return { id, displayId, x, y, direction };
}

/** Resolves with every listed robot moving unless `movers` is given. */
function resolve(
  robots: PlacedRobot[],
  movers = robots.map((r) => r.id),
  isObstacle: (p: Position) => boolean = noObstacles,
) {
  return resolveMoves(robots, new Set(movers), floor, isObstacle);
}

describe('resolveMoves', () => {
  it('moves one cell forward in each direction (N +y, E +x, S -y, W -x)', () => {
    const { moved, blocked } = resolve([
      robot(1, 2, 2, Direction.N),
      robot(2, 0, 0, Direction.E),
      robot(3, 4, 4, Direction.S),
      robot(4, 4, 0, Direction.W),
    ]);
    expect(blocked).toEqual([]);
    expect(moved).toEqual(
      new Map([
        [1, { x: 2, y: 3 }],
        [2, { x: 1, y: 0 }],
        [3, { x: 4, y: 3 }],
        [4, { x: 3, y: 0 }],
      ]),
    );
  });

  it('off the grid → Blocked by wall, no move', () => {
    const { moved, blocked } = resolve([
      robot(1, 0, 4, Direction.N),
      robot(2, 0, 0, Direction.W),
      robot(3, 4, 0, Direction.E),
      robot(4, 2, 0, Direction.S),
    ]);
    expect(moved.size).toBe(0);
    expect(blocked.map((b) => b.reason)).toEqual(
      Array(4).fill(BLOCKED_BY_WALL),
    );
  });

  it('into an Obstacle → Blocked by obstacle, no move', () => {
    const { moved, blocked } = resolve(
      [robot(1, 0, 0, Direction.N)],
      [1],
      (p) => p.x === 0 && p.y === 1,
    );
    expect(moved.size).toBe(0);
    expect(blocked).toEqual([{ robotId: 1, reason: BLOCKED_BY_OBSTACLE }]);
  });

  it('wall is checked before obstacle', () => {
    const { blocked } = resolve([robot(1, 0, 4, Direction.N)], [1], () => true);
    expect(blocked[0].reason).toBe(BLOCKED_BY_WALL);
  });

  it('two robots → same cell: lowest displayId wins, the other is blocked by it', () => {
    // id order and displayId order differ.
    const { moved, blocked } = resolve([
      robot(1, 1, 0, Direction.N, 9),
      robot(2, 0, 1, Direction.E, 3),
    ]);
    expect(moved).toEqual(new Map([[2, { x: 1, y: 1 }]]));
    expect(blocked).toEqual([{ robotId: 1, reason: 'Blocked by "R3"' }]);
  });

  it('swap → both blocked, each by the other', () => {
    const { moved, blocked } = resolve([
      robot(1, 0, 0, Direction.E),
      robot(2, 1, 0, Direction.W),
    ]);
    expect(moved.size).toBe(0);
    expect(blocked).toEqual([
      { robotId: 1, reason: 'Blocked by "R2"' },
      { robotId: 2, reason: 'Blocked by "R1"' },
    ]);
  });

  it('chain into a cell being vacated → both move', () => {
    const { moved, blocked } = resolve([
      robot(1, 0, 0, Direction.E),
      robot(2, 1, 0, Direction.E),
    ]);
    expect(blocked).toEqual([]);
    expect(moved).toEqual(
      new Map([
        [1, { x: 1, y: 0 }],
        [2, { x: 2, y: 0 }],
      ]),
    );
  });

  it('chain into a stayer → blocked by the occupant, cascading down the chain', () => {
    const { moved, blocked } = resolve(
      [
        robot(1, 0, 0, Direction.E),
        robot(2, 1, 0, Direction.E),
        robot(3, 2, 0, Direction.N),
      ],
      [1, 2],
    );
    expect(moved.size).toBe(0);
    expect(blocked).toEqual([
      { robotId: 1, reason: 'Blocked by "R2"' },
      { robotId: 2, reason: 'Blocked by "R3"' },
    ]);
  });

  it('chain into a blocked mover → blocked by it', () => {
    const { moved, blocked } = resolve([
      robot(1, 3, 0, Direction.E),
      robot(2, 4, 0, Direction.E),
    ]);
    expect(moved.size).toBe(0);
    expect(blocked).toEqual([
      { robotId: 1, reason: 'Blocked by "R2"' },
      { robotId: 2, reason: BLOCKED_BY_WALL },
    ]);
  });

  it('4-robot closed loop → all move', () => {
    const { moved, blocked } = resolve([
      robot(1, 0, 0, Direction.N),
      robot(2, 0, 1, Direction.E),
      robot(3, 1, 1, Direction.S),
      robot(4, 1, 0, Direction.W),
    ]);
    expect(blocked).toEqual([]);
    expect(moved).toEqual(
      new Map([
        [1, { x: 0, y: 1 }],
        [2, { x: 1, y: 1 }],
        [3, { x: 1, y: 0 }],
        [4, { x: 0, y: 0 }],
      ]),
    );
  });

  it('a chain feeding into a closed loop → the loop moves and so does the chain', () => {
    // Loop R1..R4 as above; R5 at (0,2) can't enter (0,1) because R1 wins it.
    const { moved, blocked } = resolve([
      robot(1, 0, 0, Direction.N),
      robot(2, 0, 1, Direction.E),
      robot(3, 1, 1, Direction.S),
      robot(4, 1, 0, Direction.W),
      robot(5, 0, 2, Direction.S),
    ]);
    expect(moved.size).toBe(4);
    expect(blocked).toEqual([{ robotId: 5, reason: 'Blocked by "R1"' }]);
  });

  it('robots that are not moving stay', () => {
    const { moved, blocked } = resolve(
      [robot(1, 0, 0, Direction.N), robot(2, 3, 3, Direction.N)],
      [1],
    );
    expect(moved).toEqual(new Map([[1, { x: 0, y: 1 }]]));
    expect(blocked).toEqual([]);
  });
});
