import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DeleteCommandDto } from './delete-command.dto.js';
import { FloorCommandDto } from './floor-command.dto.js';
import { ObstacleCommandDto } from './obstacle-command.dto.js';
import { PlaceCommandDto } from './place-command.dto.js';
import { QueueCommandDto } from './queue-command.dto.js';

async function invalid(
  dto: new () => object,
  body: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(dto, body));
  return errors.map((e) => e.property);
}

describe('command DTOs', () => {
  it('rId accepts R3', async () => {
    expect(await invalid(DeleteCommandDto, { rId: 'R3' })).toEqual([]);
  });

  it.each(['r3', '3', 'R', 'Rx', 3])('rId rejects %s', async (rId) => {
    expect(await invalid(DeleteCommandDto, { rId })).toEqual(['rId']);
  });

  it('floor accepts an empty body and ints', async () => {
    expect(await invalid(FloorCommandDto, {})).toEqual([]);
    expect(await invalid(FloorCommandDto, { width: 8, height: 3 })).toEqual([]);
    expect(await invalid(FloorCommandDto, { width: 2.5 })).toEqual(['width']);
  });

  it('obstacle requires int x and y', async () => {
    expect(await invalid(ObstacleCommandDto, { x: 2, y: 3 })).toEqual([]);
    expect(await invalid(ObstacleCommandDto, { x: 2 })).toEqual(['y']);
  });

  it('place accepts a missing rId and uppercase directions only', async () => {
    const body = { x: 2, y: 3, direction: 'EAST' };
    expect(await invalid(PlaceCommandDto, body)).toEqual([]);
    expect(await invalid(PlaceCommandDto, { ...body, rId: 'R4' })).toEqual([]);
    expect(
      await invalid(PlaceCommandDto, { ...body, direction: 'east' }),
    ).toEqual(['direction']);
    expect(await invalid(PlaceCommandDto, { ...body, rId: 'r4' })).toEqual([
      'rId',
    ]);
  });

  it('queue requires one or more uppercase commands', async () => {
    expect(
      await invalid(QueueCommandDto, { rId: 'R1', commands: ['MOVE', 'LEFT'] }),
    ).toEqual([]);
    expect(await invalid(QueueCommandDto, { rId: 'R1', commands: [] })).toEqual(
      ['commands'],
    );
    expect(
      await invalid(QueueCommandDto, { rId: 'R1', commands: ['move'] }),
    ).toEqual(['commands']);
  });
});
