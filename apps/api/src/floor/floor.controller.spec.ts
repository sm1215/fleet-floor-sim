import { Test } from '@nestjs/testing';
import { EngineService } from '../engine/engine.service.js';
import { FloorController } from './floor.controller.js';
import { FloorService } from './floor.service.js';

describe('FloorController', () => {
  const floor = { id: 1, height: 5, width: 5 };
  const service = {
    findAll: vi.fn().mockResolvedValue([floor]),
    reset: vi.fn().mockResolvedValue(floor),
  };
  const engine = { history: vi.fn(), fork: vi.fn() };
  let controller: FloorController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FloorController],
      providers: [
        { provide: FloorService, useValue: service },
        { provide: EngineService, useValue: engine },
      ],
    }).compile();
    controller = moduleRef.get(FloorController);
  });

  it('findAll', async () => {
    await expect(controller.findAll()).resolves.toEqual([floor]);
  });

  it('reset', async () => {
    await expect(controller.reset(1)).resolves.toEqual(floor);
    expect(service.reset).toHaveBeenCalledWith(1);
  });
  it('history returns the state at that tick', async () => {
    const state = { width: 5, height: 5, cells: [], robots: [] };
    engine.history.mockResolvedValue({ ok: true, state });
    await expect(controller.history(1, '3')).resolves.toEqual(state);
    expect(engine.history).toHaveBeenCalledWith(1, 3);
  });

  it('history: ignored → 400; an empty tick is not a number', async () => {
    engine.history.mockResolvedValue({ ok: false, reason: 'No history' });
    await expect(controller.history(1, '')).rejects.toThrow('No history');
    expect(engine.history).toHaveBeenLastCalledWith(1, NaN);
  });

  it('fork returns the new floor id', async () => {
    engine.fork.mockResolvedValue({ ok: true, floorId: 4 });
    await expect(controller.fork(1, { tick: 2 })).resolves.toEqual({
      floorId: 4,
    });
    expect(engine.fork).toHaveBeenCalledWith(1, 2);
  });

  it('fork: ignored → 400 with the reason', async () => {
    engine.fork.mockResolvedValue({ ok: false, reason: 'Floor 9 not found' });
    await expect(controller.fork(9, { tick: 0 })).rejects.toThrow(
      'Floor 9 not found',
    );
  });
});
