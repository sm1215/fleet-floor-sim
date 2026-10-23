import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CommandsController } from './commands.controller.js';
import { EngineService } from './engine.service.js';

describe('CommandsController', () => {
  const ok = { ok: true, log: { action: 'PLACE', params: 'R1 0, 0, NORTH' } };
  let engine: Record<
    'floor' | 'obstacle' | 'place' | 'queue' | 'goto' | 'delete',
    ReturnType<typeof vi.fn>
  >;
  let controller: CommandsController;

  beforeEach(async () => {
    engine = {
      floor: vi.fn().mockResolvedValue(ok),
      obstacle: vi.fn().mockResolvedValue(ok),
      place: vi.fn().mockResolvedValue(ok),
      queue: vi.fn().mockResolvedValue(ok),
      goto: vi.fn().mockResolvedValue(ok),
      delete: vi.fn().mockResolvedValue(ok),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CommandsController],
      providers: [{ provide: EngineService, useValue: engine }],
    }).compile();
    controller = moduleRef.get(CommandsController);
  });

  it('floor defaults to 10x8 and returns { ok: true }', async () => {
    await expect(controller.floor({})).resolves.toEqual({ ok: true });
    expect(engine.floor).toHaveBeenCalledWith(10, 8);
    await controller.floor({ width: 8, height: 3 });
    expect(engine.floor).toHaveBeenLastCalledWith(8, 3);
  });

  it('obstacle passes x and y', async () => {
    await expect(controller.obstacle({ x: 2, y: 3 })).resolves.toEqual({
      ok: true,
    });
    expect(engine.obstacle).toHaveBeenCalledWith(2, 3);
  });

  it('place parses rId and direction; no rId → undefined', async () => {
    await controller.place({ rId: 'R3', x: 2, y: 3, direction: 'EAST' });
    expect(engine.place).toHaveBeenCalledWith(3, 2, 3, 1);
    await controller.place({ x: 0, y: 1, direction: 'WEST' });
    expect(engine.place).toHaveBeenLastCalledWith(undefined, 0, 1, 3);
  });

  it('queue parses rId and passes the commands', async () => {
    await controller.queue({ rId: 'R12', commands: ['MOVE', 'LEFT'] });
    expect(engine.queue).toHaveBeenCalledWith(12, ['MOVE', 'LEFT']);
  });

  it('goto parses rId and passes x and y', async () => {
    await expect(controller.goto({ rId: 'R2', x: 3, y: 4 })).resolves.toEqual({
      ok: true,
    });
    expect(engine.goto).toHaveBeenCalledWith(2, 3, 4);
  });

  it('delete parses rId', async () => {
    await expect(controller.delete({ rId: 'R1' })).resolves.toEqual({
      ok: true,
    });
    expect(engine.delete).toHaveBeenCalledWith(1);
  });

  it('an ignored command → 400 with the reason', async () => {
    engine.obstacle.mockResolvedValue({
      ok: false,
      reason: 'Cell 0,0 has a robot',
    });
    const error = await controller
      .obstacle({ x: 0, y: 0 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe('Cell 0,0 has a robot');
  });
});
