import { Direction } from '../shared/types.js';
import { formatReport } from './report.js';

describe('formatReport', () => {
  it('formats one line per robot', () => {
    expect(
      formatReport([{ displayId: 1, x: 2, y: 3, direction: Direction.N }]),
    ).toEqual(['R1 2,3,NORTH']);
  });

  it('sorts by displayId', () => {
    const robots = [
      { displayId: 2, x: 1, y: 0, direction: Direction.E },
      { displayId: 1, x: 0, y: 4, direction: Direction.S },
    ];
    expect(formatReport(robots)).toEqual(['R1 0,4,SOUTH', 'R2 1,0,EAST']);
    expect(robots[0].displayId).toBe(2);
  });

  it('returns EMPTY with no robots', () => {
    expect(formatReport([])).toEqual(['EMPTY']);
  });

  it('maps all four directions', () => {
    expect(
      formatReport([{ displayId: 3, x: 0, y: 0, direction: Direction.W }]),
    ).toEqual(['R3 0,0,WEST']);
  });
});
