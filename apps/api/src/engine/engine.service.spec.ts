import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { doNext } from '../../../queue/do-next.js';
import { EngineService, STEP_WHILE_RUNNING } from './engine.service.js';

vi.mock('../../../queue/do-next.js', () => ({ doNext: vi.fn() }));

const doNextMock = vi.mocked(doNext);

describe('EngineService', () => {
  let service: EngineService;

  beforeEach(() => {
    vi.useFakeTimers();
    doNextMock.mockReset();
    doNextMock.mockResolvedValue(undefined);
    service = new EngineService();
  });

  afterEach(() => {
    service.onModuleDestroy();
    vi.useRealTimers();
  });

  it('starts at tick 0, tickRate 1000, not running, no errors', () => {
    expect(service.getState()).toEqual({
      currentTick: 0,
      tickRate: 1000,
      running: false,
      errors: [],
    });
  });

  it('step() advances one tick and returns the state', async () => {
    await expect(service.step()).resolves.toMatchObject({ currentTick: 1 });
    expect(doNextMock).toHaveBeenCalledTimes(1);
  });

  it('a failed step() throws a 500 with the error message', async () => {
    doNextMock.mockRejectedValue(new Error('boom'));
    const error = await service.step().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((error as Error).message).toBe('boom');
  });

  it('step() while running throws a 400 and does not step', async () => {
    service.toggle();
    const error = await service.step().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(STEP_WHILE_RUNNING);
    expect(doNextMock).not.toHaveBeenCalled();
    expect(service.getState().currentTick).toBe(0);
  });

  it('toggle() turns running on and off', () => {
    expect(service.toggle().running).toBe(true);
    expect(service.toggle().running).toBe(false);
  });

  it('while running, steps every tickRate ms', async () => {
    service.toggle();
    await vi.advanceTimersByTimeAsync(3000);
    expect(service.getState().currentTick).toBe(3);
  });

  it('errors from automatic steps are returned once, then cleared', async () => {
    doNextMock.mockRejectedValueOnce(new Error('boom'));
    service.toggle();
    await vi.advanceTimersByTimeAsync(1000);
    expect(service.getState().errors).toEqual(['boom']);
    expect(service.getState().errors).toEqual([]);
  });

  it('onModuleDestroy() stops running', async () => {
    service.toggle();
    service.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(5000);
    expect(service.getState()).toMatchObject({
      currentTick: 0,
      running: false,
    });
  });
});
