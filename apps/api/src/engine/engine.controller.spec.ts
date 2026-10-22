import { Test } from '@nestjs/testing';
import { EngineController } from './engine.controller.js';
import { EngineService } from './engine.service.js';

describe('EngineController', () => {
  const state = { currentTick: 1, tickRate: 1000, running: false, errors: [] };
  const service = {
    getState: vi.fn().mockReturnValue(state),
    step: vi.fn().mockResolvedValue(state),
    toggle: vi.fn().mockReturnValue({ ...state, running: true }),
  };
  let controller: EngineController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [EngineController],
      providers: [{ provide: EngineService, useValue: service }],
    }).compile();
    controller = moduleRef.get(EngineController);
  });

  it('getState', () => {
    expect(controller.getState()).toEqual(state);
  });

  it('step', async () => {
    await expect(controller.step()).resolves.toEqual(state);
    expect(service.step).toHaveBeenCalled();
  });

  it('toggle', () => {
    expect(controller.toggle().running).toBe(true);
  });
});
