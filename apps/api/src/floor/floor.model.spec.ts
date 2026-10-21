import { inBounds, isObstacle } from './floor.model.js';

describe('floor.model', () => {
  const floor = { width: 3, height: 2 };

  it('inBounds accepts positions inside the floor', () => {
    expect(inBounds(floor, { x: 0, y: 0 })).toBe(true);
    expect(inBounds(floor, { x: 2, y: 1 })).toBe(true);
  });

  it('inBounds rejects positions outside the floor', () => {
    expect(inBounds(floor, { x: 3, y: 0 })).toBe(false);
    expect(inBounds(floor, { x: 0, y: 2 })).toBe(false);
    expect(inBounds(floor, { x: -1, y: 0 })).toBe(false);
  });

  it('isObstacle checks the cell at the position', () => {
    const cells = [
      { obstacle: true, xPosition: 1, yPosition: 1 },
      { obstacle: false, xPosition: 0, yPosition: 0 },
    ];
    expect(isObstacle(cells, { x: 1, y: 1 })).toBe(true);
    expect(isObstacle(cells, { x: 0, y: 0 })).toBe(false);
    expect(isObstacle(cells, { x: 2, y: 0 })).toBe(false);
  });
});
