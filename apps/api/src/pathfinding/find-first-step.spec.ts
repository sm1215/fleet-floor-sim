import { Direction, type Position } from '../shared/types.js';
import { findFirstStep } from './find-first-step.js';

const floor = { width: 5, height: 5 };

/** A wall test over the given cells. */
const walls =
  (...cells: [number, number][]) =>
  ({ x, y }: Position) =>
    cells.some(([wx, wy]) => wx === x && wy === y);
const open = walls();

const step = (
  start: [number, number],
  target: [number, number],
  isWall = open,
) =>
  findFirstStep(
    { x: start[0], y: start[1] },
    { x: target[0], y: target[1] },
    floor,
    isWall,
  );

describe('findFirstStep()', () => {
  it('a straight line in each direction', () => {
    expect(step([0, 0], [0, 3])).toBe(Direction.N);
    expect(step([0, 0], [3, 0])).toBe(Direction.E);
    expect(step([2, 4], [2, 0])).toBe(Direction.S);
    expect(step([4, 0], [0, 0])).toBe(Direction.W);
  });

  it('equally short first steps prefer N, E, S, W', () => {
    expect(step([0, 0], [2, 2])).toBe(Direction.N);
    expect(step([2, 2], [4, 0])).toBe(Direction.E);
    expect(step([2, 2], [0, 0])).toBe(Direction.S);
  });

  it('detours around an obstacle wall', () => {
    const wall = walls([1, 0], [1, 1], [1, 2], [1, 3]);
    expect(step([0, 0], [2, 0], wall)).toBe(Direction.N);
  });

  it('a shorter path beats the tie order', () => {
    // N is blocked; E and W both take 5 steps, S takes longer.
    expect(step([2, 1], [2, 4], walls([2, 2]))).toBe(Direction.E);
  });

  it('takes the only open route', () => {
    expect(step([0, 1], [2, 1], walls([1, 1], [0, 2]))).toBe(Direction.S);
  });

  it('target is a wall → null', () => {
    expect(step([0, 0], [2, 2], walls([2, 2]))).toBeNull();
  });

  it('target is enclosed → null', () => {
    const ring = walls([1, 2], [3, 2], [2, 1], [2, 3]);
    expect(step([0, 0], [2, 2], ring)).toBeNull();
  });

  it('target outside the grid → null', () => {
    expect(step([0, 0], [5, 0])).toBeNull();
    expect(step([0, 0], [0, -1])).toBeNull();
  });

  it('start equals target → null', () => {
    expect(step([2, 2], [2, 2])).toBeNull();
  });

  it('the start cell is never a wall', () => {
    expect(step([0, 0], [0, 2], walls([0, 0]))).toBe(Direction.N);
  });

  it('never asks isWall about out-of-bounds positions', () => {
    const isWall = vi.fn(open);
    step([0, 0], [4, 4], isWall);
    step([4, 4], [0, 0], isWall);
    expect(isWall).toHaveBeenCalled();
    for (const [{ x, y }] of isWall.mock.calls) {
      expect(x >= 0 && y >= 0 && x < 5 && y < 5).toBe(true);
    }
  });
});
