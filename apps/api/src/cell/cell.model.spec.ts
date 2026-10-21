import { toPosition } from './cell.model.js';

describe('cell.model', () => {
  it('toPosition maps x/y columns to a Position', () => {
    expect(toPosition({ xPosition: 3, yPosition: 4 })).toEqual({ x: 3, y: 4 });
  });
});
