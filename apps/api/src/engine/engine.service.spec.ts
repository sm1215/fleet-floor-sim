import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import type { NextCommand } from '../queue/next-command.js';
import type { QueueService } from '../queue/queue.service.js';
import type { Robot } from '../../database/entities/index.js';
import type { Command } from '../shared/types.js';
import type { EngineCommandsService } from './engine-commands.service.js';
import { EngineService, STEP_WHILE_RUNNING } from './engine.service.js';

type Results = Promise<NextCommand | null>[];

describe('EngineService', () => {
  let doNext: ReturnType<typeof vi.fn<() => Promise<Results>>>;
  let service: EngineService;
  let commands: Record<'left' | 'right' | 'moveAll', ReturnType<typeof vi.fn>>;

  /** A doNext() result whose single per-robot promise settles on demand. */
  function pendingResult() {
    let resolve!: () => void;
    const robot = new Promise<null>((r) => (resolve = () => r(null)));
    return { results: Promise.resolve([robot]), resolve };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    doNext = vi.fn<() => Promise<Results>>().mockResolvedValue([]);
    commands = {
      left: vi.fn().mockResolvedValue(undefined),
      right: vi.fn().mockResolvedValue(undefined),
      moveAll: vi.fn().mockResolvedValue([]),
    };
    service = new EngineService(
      { doNext } as unknown as QueueService,
      commands as unknown as EngineCommandsService,
    );
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

  it('step() increments currentTick by 1, calls doNext() and returns the state', async () => {
    await expect(service.step()).resolves.toMatchObject({ currentTick: 1 });
    await service.step();
    expect(service.getState().currentTick).toBe(2);
    expect(doNext).toHaveBeenCalledTimes(2);
  });

  it('step() waits for doNext() and every per-robot promise it returns', async () => {
    const pending = pendingResult();
    doNext.mockReturnValue(pending.results);
    let done = false;
    const stepping = service.step().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    pending.resolve();
    await stepping;
    expect(done).toBe(true);
  });

  it('a failed doNext() makes step() throw a 500 with the error message', async () => {
    doNext.mockRejectedValue(new Error('boom'));
    const error = await service.step().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((error as Error).message).toBe('boom');
  });

  it('a rejected per-robot promise makes step() throw a 500', async () => {
    doNext.mockResolvedValue([Promise.reject(new Error('robot boom'))]);
    const error = await service.step().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((error as Error).message).toBe('robot boom');
  });

  it('step() while running throws a 400 and does not step', async () => {
    service.toggle();
    const error = await service.step().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(STEP_WHILE_RUNNING);
    expect(doNext).not.toHaveBeenCalled();
    expect(service.getState().currentTick).toBe(0);
  });

  it('toggle() steps every tickRate ms until toggled off', async () => {
    expect(service.toggle().running).toBe(true);
    await vi.advanceTimersByTimeAsync(999);
    expect(service.getState().currentTick).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(service.getState().currentTick).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(service.getState().currentTick).toBe(3);

    expect(service.toggle().running).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(service.getState().currentTick).toBe(3);
  });

  it('uses the current tickRate', async () => {
    service.tickRate = 250;
    service.toggle();
    await vi.advanceTimersByTimeAsync(1000);
    expect(service.getState().currentTick).toBe(4);
  });

  it('errors from automatic steps are returned once, then cleared; running continues', async () => {
    doNext.mockRejectedValueOnce(new Error('boom'));
    service.toggle();
    await vi.advanceTimersByTimeAsync(1000);
    expect(service.getState().errors).toEqual(['boom']);
    expect(service.getState().errors).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(service.getState()).toMatchObject({ currentTick: 2, running: true });
  });

  it('does not start the next step until the current one settles', async () => {
    const pending = pendingResult();
    doNext.mockReturnValueOnce(pending.results);
    service.toggle();
    await vi.advanceTimersByTimeAsync(5000);
    expect(doNext).toHaveBeenCalledTimes(1);
    pending.resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(doNext).toHaveBeenCalledTimes(2);
  });

  it('pausing and resuming during a pending step keeps a single timer chain', async () => {
    const pending = pendingResult();
    doNext.mockReturnValueOnce(pending.results);
    service.toggle();
    await vi.advanceTimersByTimeAsync(1000);
    expect(service.getState().currentTick).toBe(1);

    service.toggle();
    service.toggle();
    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(1000);
    expect(service.getState().currentTick).toBe(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(service.getState().currentTick).toBe(3);
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

  it('reset sets currentTick to 0 and running to false', async () => {
    await service.step();
    await service.step();
    await expect(service.reset()).resolves.toEqual({
      currentTick: 0,
      tickRate: 1000,
      running: false,
      errors: [],
    });
  });

  it('reset waits for a tick in progress, then drops its errors', async () => {
    let fail!: (error: Error) => void;
    doNext.mockReturnValue(
      new Promise<Results>((_, reject) => (fail = reject)),
    );
    service.toggle();
    await vi.advanceTimersByTimeAsync(1000);
    let done = false;
    const resetting = service.reset().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    fail(new Error('boom'));
    await resetting;
    expect(service.getState()).toMatchObject({
      currentTick: 0,
      running: false,
      errors: [],
    });
  });

  it('reset stops a running engine', async () => {
    service.toggle();
    await service.reset();
    await vi.advanceTimersByTimeAsync(3000);
    expect(service.getState()).toMatchObject({
      currentTick: 0,
      running: false,
    });
    expect(doNext).not.toHaveBeenCalled();
  });

  describe('executing the commands doNext() returns', () => {
    function taken(id: number, command: Command): Promise<NextCommand> {
      return Promise.resolve({ robot: { id } as Robot, command });
    }

    it('LEFT → left(), RIGHT → right(), all MOVEs → one moveAll() call', async () => {
      doNext.mockResolvedValue([
        taken(1, 'MOVE'),
        taken(2, 'LEFT'),
        Promise.resolve(null),
        taken(4, 'RIGHT'),
        taken(5, 'MOVE'),
      ]);
      await service.step();
      expect(commands.left.mock.calls).toEqual([[2]]);
      expect(commands.right.mock.calls).toEqual([[4]]);
      expect(commands.moveAll.mock.calls).toEqual([[[1, 5]]]);
    });

    it('no commands → nothing applied; moveAll() gets an empty list', async () => {
      doNext.mockResolvedValue([Promise.resolve(null)]);
      await service.step();
      expect(commands.left).not.toHaveBeenCalled();
      expect(commands.right).not.toHaveBeenCalled();
      expect(commands.moveAll).toHaveBeenCalledWith([]);
    });

    it('a failed command makes step() throw a 500', async () => {
      doNext.mockResolvedValue([taken(1, 'MOVE')]);
      commands.moveAll.mockRejectedValue(new Error('db down'));
      await expect(service.step()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
