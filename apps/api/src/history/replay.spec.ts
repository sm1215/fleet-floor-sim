import { Direction } from '../shared/types.js';
import type { FloorState } from './floor-state.js';
import { applyEntry } from './replay.js';

const entry = (action: string, params: string, result = 'OK') => ({
  action,
  params,
  result,
});

/** An all-Open floor with the given robots. */
function floor(
  width: number,
  height: number,
  robots: FloorState['robots'] = [],
): FloorState {
  const cells: FloorState['cells'] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) cells.push({ x, y, obstacle: false });
  }
  return { width, height, cells, robots };
}

const robot = (
  id: number,
  displayId: number,
  x: number,
  y: number,
  direction = Direction.N,
  queue: FloorState['robots'][number]['queue'] = [],
) => ({ id, displayId, x, y, direction, queue });

const empty: FloorState = { width: 0, height: 0, cells: [], robots: [] };

describe('applyEntry()', () => {
  it('FLOOR CREATED → an all-Open w×h floor with no robots', () => {
    expect(applyEntry(empty, entry('FLOOR', '3, 2, CREATED'))).toEqual(
      floor(3, 2),
    );
  });

  it('FLOOR RESIZED adds and removes cells, keeping obstacles inside', () => {
    const start = floor(3, 3);
    start.cells.find((c) => c.x === 1 && c.y === 1)!.obstacle = true;
    start.cells.find((c) => c.x === 2 && c.y === 2)!.obstacle = true;
    const next = applyEntry(start, entry('FLOOR', '4, 2, RESIZED'));
    const expected = floor(4, 2);
    expected.cells.find((c) => c.x === 1 && c.y === 1)!.obstacle = true;
    expect(next).toEqual(expected);
  });

  it('RESIZED moves a displaced robot to the nearest free Open cell (same as planResize)', () => {
    const start = floor(3, 3, [
      robot(1, 1, 0, 1),
      robot(2, 2, 2, 2, Direction.E, ['MOVE']),
    ]);
    // 3x2: R2 at 2,2 is displaced; nearest free Open cell is 2,1.
    const next = applyEntry(start, entry('FLOOR', '3, 2, RESIZED'));
    expect(next.robots).toEqual([
      robot(1, 1, 0, 1),
      robot(2, 2, 2, 1, Direction.E, ['MOVE']),
    ]);
  });

  it("OBSTACLE x, y, ON / OFF sets that cell's obstacle", () => {
    const on = applyEntry(floor(2, 2), entry('OBSTACLE', '1, 0, ON'));
    expect(on.cells.find((c) => c.x === 1 && c.y === 0)!.obstacle).toBe(true);
    const off = applyEntry(on, entry('OBSTACLE', '1, 0, OFF'));
    expect(off).toEqual(floor(2, 2));
  });

  it('PLACE of an existing displayId moves and turns it', () => {
    const start = floor(3, 3, [robot(4, 1, 0, 0, Direction.N, ['LEFT'])]);
    const next = applyEntry(start, entry('PLACE', 'R1 2, 1, WEST'));
    expect(next.robots).toEqual([robot(4, 1, 2, 1, Direction.W, ['LEFT'])]);
  });

  it('PLACE of a new robot gets an id above every existing id', () => {
    const start = floor(3, 3, [robot(7, 2, 0, 0), robot(3, 5, 1, 0)]);
    const next = applyEntry(start, entry('PLACE', 'R1 2, 2, SOUTH'));
    expect(next.robots).toEqual([
      robot(8, 1, 2, 2, Direction.S),
      robot(7, 2, 0, 0),
      robot(3, 5, 1, 0),
    ]);
    expect(
      applyEntry(floor(1, 1), entry('PLACE', 'R1 0, 0, NORTH')).robots,
    ).toEqual([robot(1, 1, 0, 0)]);
  });

  it("QUEUE appends the commands to that robot's queue", () => {
    const start = floor(2, 2, [robot(1, 1, 0, 0, Direction.N, ['MOVE'])]);
    const next = applyEntry(start, entry('QUEUE', 'R1 LEFT MOVE'));
    expect(next.robots[0].queue).toEqual(['MOVE', 'LEFT', 'MOVE']);
  });

  it('DELETE removes the robot and its queue', () => {
    const start = floor(2, 2, [
      robot(1, 1, 0, 0, Direction.N, ['MOVE']),
      robot(2, 2, 1, 0),
    ]);
    expect(applyEntry(start, entry('DELETE', 'R1')).robots).toEqual([
      robot(2, 2, 1, 0),
    ]);
  });

  it('TICK sets each robot from the result lines', () => {
    const start = floor(3, 3, [
      robot(1, 1, 0, 0, Direction.N, ['MOVE']),
      robot(2, 2, 2, 0, Direction.N, ['LEFT']),
    ]);
    const next = applyEntry(
      start,
      entry('TICK', '1', 'R1 0,1,NORTH\nR2 2,0,WEST'),
    );
    expect(next.robots).toEqual([
      robot(1, 1, 0, 1, Direction.N),
      robot(2, 2, 2, 0, Direction.W),
    ]);
  });

  it('TICK pops one head per robot, including robots that did not move', () => {
    const start = floor(3, 3, [
      robot(1, 1, 0, 0, Direction.W, ['MOVE', 'RIGHT']),
      robot(2, 2, 2, 0, Direction.N),
    ]);
    // R1's MOVE is blocked by the wall: it stays, but the head is still used.
    const next = applyEntry(
      start,
      entry('TICK', '1', 'R1 0,0,WEST\nR2 2,0,NORTH'),
    );
    expect(next.robots.map((r) => r.queue)).toEqual([['RIGHT'], []]);
  });

  it('TICK with EMPTY leaves no robots to update', () => {
    expect(applyEntry(floor(2, 2), entry('TICK', '1', 'EMPTY'))).toEqual(
      floor(2, 2),
    );
  });

  it('applyEntry does not mutate its input', () => {
    const start = floor(3, 3, [robot(1, 1, 0, 0, Direction.N, ['MOVE'])]);
    const copy = structuredClone(start);
    for (const e of [
      entry('FLOOR', '2, 2, RESIZED'),
      entry('OBSTACLE', '1, 1, ON'),
      entry('PLACE', 'R1 1, 0, EAST'),
      entry('PLACE', 'R2 2, 2, EAST'),
      entry('QUEUE', 'R1 LEFT'),
      entry('DELETE', 'R1'),
      entry('TICK', '1', 'R1 0,1,NORTH'),
    ]) {
      applyEntry(start, e);
      expect(start).toEqual(copy);
    }
  });
});
