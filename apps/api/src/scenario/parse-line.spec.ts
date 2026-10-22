import { Direction } from '../shared/types.js';
import { parseLine } from './parse-line.js';

describe('parseLine', () => {
  it('parses PLACE', () => {
    expect(parseLine('PLACE R1 0,0,EAST')).toEqual({
      kind: 'PLACE',
      displayId: 1,
      x: 0,
      y: 0,
      direction: Direction.E,
    });
  });

  it('parses mixed case and whitespace around commas', () => {
    expect(parseLine('place r1 0 , 0 , east')).toEqual(
      parseLine('PLACE R1 0,0,EAST'),
    );
  });

  it('parses FLOOR with defaults', () => {
    expect(parseLine('FLOOR 4,3')).toEqual({
      kind: 'FLOOR',
      width: 4,
      height: 3,
    });
    expect(parseLine('FLOOR')).toEqual({ kind: 'FLOOR', width: 5, height: 5 });
    expect(parseLine('FLOOR 4')).toEqual({
      kind: 'FLOOR',
      width: 4,
      height: 5,
    });
  });

  it('parses multi-command QUEUE and LEFT / RIGHT / MOVE', () => {
    expect(parseLine('QUEUE R2 MOVE RIGHT MOVE')).toEqual({
      kind: 'QUEUE',
      displayId: 2,
      commands: ['MOVE', 'RIGHT', 'MOVE'],
    });
    expect(parseLine('move r3')).toEqual({
      kind: 'QUEUE',
      displayId: 3,
      commands: ['MOVE'],
    });
    expect(parseLine('LEFT R1')).toEqual({
      kind: 'QUEUE',
      displayId: 1,
      commands: ['LEFT'],
    });
    expect(parseLine('RIGHT R1')).toEqual({
      kind: 'QUEUE',
      displayId: 1,
      commands: ['RIGHT'],
    });
  });

  it('parses TICK, REPORT and OBSTACLE', () => {
    expect(parseLine('TICK')).toEqual({ kind: 'TICK', amount: 1 });
    expect(parseLine('TICK 10')).toEqual({ kind: 'TICK', amount: 10 });
    expect(parseLine('REPORT')).toEqual({ kind: 'REPORT' });
    expect(parseLine('OBSTACLE 2,3')).toEqual({ kind: 'OBSTACLE', x: 2, y: 3 });
  });

  it('parses CRLF-split lines', () => {
    expect(parseLine('TICK 3\r')).toEqual({ kind: 'TICK', amount: 3 });
  });

  it.each([
    '',
    '   ',
    '# PLACE R1 0,0,EAST',
    'JUMP R1',
    'PLACE 1 0,0,EAST',
    'PLACE R1 0,0',
    'PLACE R1 0,0,UP',
    'PLACE R1 -1,0,EAST',
    'PLACE R1 0,0,EAST,X',
    'FLOOR 4,3,2',
    'TICK 1 2',
    'REPORT NOW',
    'QUEUE R1',
    'QUEUE R1 MOVE JUMP',
    'R1 1,0,EAST',
    'MOVE R1 R2',
    'OBSTACLE 2',
    'FLOOR 4,',
  ])('returns null for %j', (line) => {
    expect(parseLine(line)).toBeNull();
  });
});
