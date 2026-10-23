import { Direction } from '../shared/types.js';
import {
  deleteParams,
  floorParams,
  obstacleParams,
  placeParams,
  queueParams,
} from './log-params.js';

describe('log params', () => {
  it('PLACE: rId x, y, DIRECTION', () => {
    expect(placeParams(1, 2, 3, Direction.N)).toBe('R1 2, 3, NORTH');
    expect(placeParams(4, 0, 0, Direction.W)).toBe('R4 0, 0, WEST');
  });

  it('OBSTACLE: x, y, ON/OFF', () => {
    expect(obstacleParams(2, 3, true)).toBe('2, 3, ON');
    expect(obstacleParams(2, 3, false)).toBe('2, 3, OFF');
  });

  it('QUEUE: rId and the commands in order', () => {
    expect(queueParams(1, ['MOVE'])).toBe('R1 MOVE');
    expect(queueParams(1, ['MOVE', 'LEFT'])).toBe('R1 MOVE LEFT');
  });

  it('DELETE: rId', () => {
    expect(deleteParams(7)).toBe('R7');
  });

  it('FLOOR: width, height, CREATED/RESIZED', () => {
    expect(floorParams(5, 5, 'CREATED')).toBe('5, 5, CREATED');
    expect(floorParams(8, 3, 'RESIZED')).toBe('8, 3, RESIZED');
  });
});
