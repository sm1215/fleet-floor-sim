import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import type { Mock } from 'vitest';
import type { NextCommand } from '../queue/next-command.js';
import type { QueueService } from '../queue/queue.service.js';
import type { Robot } from '../../database/entities/index.js';
import type { Command } from '../shared/types.js';
import { WriteLock } from '../shared/write-lock.js';
import type { HistoryService } from '../history/history.service.js';
import type { LogEntryService } from '../log-entry/log-entry.service.js';
import type { DirectCommandsService } from './direct-commands.service.js';
import type { EngineCommandsService } from './engine-commands.service.js';
import { EngineService, STEP_WHILE_RUNNING } from './engine.service.js';

type Results = Promise<NextCommand | null>[];

describe('EngineService', () => {
  let doNext: ReturnType<typeof vi.fn<() => Promise<Results>>>;
  let service: EngineService;
  let lock: WriteLock;
  let commands: Record<'left' | 'right' | 'moveAll', ReturnType<typeof vi.fn>>;
  let direct: Record<
    'floor' | 'obstacle' | 'place' | 'queue' | 'delete' | 'report' | 'clear',
    ReturnType<typeof vi.fn>
  >;
  let logEntries: { create: ReturnType<typeof vi.fn> };
  let history: { snapshot: ReturnType<typeof vi.fn> };

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
    direct = {
      floor: vi.fn().mockResolvedValue({ ok: true }),
      obstacle: vi.fn().mockResolvedValue({ ok: true }),
      place: vi.fn().mockResolvedValue({ ok: true }),
      queue: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      report: vi.fn().mockResolvedValue(['EMPTY']),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    logEntries = { create: vi.fn().mockResolvedValue(undefined) };
    history = { snapshot: vi.fn().mockResolvedValue(undefined) };
    lock = new WriteLock();
    // A transaction runs its work with the stand-in manager; a throw rejects it.
    const dataSource = {
      transaction: (work: (m: EntityManager) => Promise<unknown>) =>
        work(manager),
      // Floors 1 and 2 exist.
      getRepository: () => ({
        existsBy: ({ id }: { id: number }) =>
          Promise.resolve([1, 2].includes(id)),
      }),
    };
    service = new EngineService(
      { doNext } as unknown as QueueService,
      commands as unknown as EngineCommandsService,
      direct as unknown as DirectCommandsService,
      lock,
      logEntries as unknown as LogEntryService,
      dataSource as unknown as DataSource,
      history as unknown as HistoryService,
    );
    service.floorId = 1;
  });

  /** The tick's transaction, as seen by its collaborators. */
  const manager = { tx: true } as unknown as EntityManager;

  afterEach(() => {
    service.onModuleDestroy();
    vi.useRealTimers();
  });

  it('starts at tick 0, tickRate 1000, not running, no errors', () => {
    expect(service.getState()).toEqual({
      floorId: 1,
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
    // The failed tick rolled back, so the next one is tick 1 again.
    expect(service.getState()).toMatchObject({ currentTick: 1, running: true });
  });

  it('a failed step keeps currentTick', async () => {
    doNext.mockRejectedValueOnce(new Error('boom'));
    await expect(service.step()).rejects.toThrow('boom');
    expect(service.currentTick).toBe(0);
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
    // The tick number moves only once the tick commits.
    expect(doNext).toHaveBeenCalledTimes(1);
    expect(service.getState().currentTick).toBe(0);

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
    await expect(service.reset(1)).resolves.toEqual({
      floorId: 1,
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
    const resetting = service.reset(1).then(() => (done = true));
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
    await service.reset(1);
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
      expect(doNext).toHaveBeenCalledWith(1, manager);
      expect(commands.left.mock.calls).toEqual([[2, manager]]);
      expect(commands.right.mock.calls).toEqual([[4, manager]]);
      expect(commands.moveAll.mock.calls).toEqual([[[1, 5], manager]]);
    });

    it('no commands → nothing applied; moveAll() gets an empty list', async () => {
      doNext.mockResolvedValue([Promise.resolve(null)]);
      await service.step();
      expect(commands.left).not.toHaveBeenCalled();
      expect(commands.right).not.toHaveBeenCalled();
      expect(commands.moveAll).toHaveBeenCalledWith([], manager);
    });

    it('a failed command makes step() throw a 500', async () => {
      doNext.mockResolvedValue([taken(1, 'MOVE')]);
      commands.moveAll.mockRejectedValue(new Error('db down'));
      await expect(service.step()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('direct commands', () => {
    it('tick(3) steps three times', async () => {
      await expect(service.tick(3)).resolves.toEqual({ ok: true });
      expect(service.currentTick).toBe(3);
      expect(doNext).toHaveBeenCalledTimes(3);
    });

    it('tick ignores 0 and 1.5', async () => {
      expect((await service.tick(0)).ok).toBe(false);
      expect((await service.tick(1.5)).ok).toBe(false);
      expect(service.currentTick).toBe(0);
      expect(doNext).not.toHaveBeenCalled();
    });

    it('tick accepts up to 99 and ignores 100', async () => {
      expect((await service.tick(100)).ok).toBe(false);
      expect(doNext).not.toHaveBeenCalled();
      await expect(service.tick(99)).resolves.toEqual({ ok: true });
      expect(service.currentTick).toBe(99);
    });

    it('a failing tick returns the error instead of throwing, and stops', async () => {
      doNext.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('boom'));
      await expect(service.tick(5)).resolves.toEqual({
        ok: false,
        reason: 'boom',
      });
      expect(doNext).toHaveBeenCalledTimes(2);
    });

    it('step waits for the write lock', async () => {
      let release!: () => void;
      const held = lock.run(() => new Promise<void>((r) => (release = r)));
      const stepping = service.step();
      await vi.advanceTimersByTimeAsync(0);
      expect(doNext).not.toHaveBeenCalled();
      release();
      await held;
      await stepping;
      expect(doNext).toHaveBeenCalledTimes(1);
    });

    it('tick while running is ignored', async () => {
      service.toggle();
      await expect(service.tick(2)).resolves.toEqual({
        ok: false,
        reason: STEP_WHILE_RUNNING,
      });
      expect(doNext).not.toHaveBeenCalled();
      expect(service.currentTick).toBe(0);
    });

    it('delegates floor/obstacle/place/queue/report/clear to DirectCommandsService', async () => {
      const record = expect.any(Function) as unknown;
      await expect(service.floor(4, 3)).resolves.toEqual({ ok: true });
      expect(direct.floor).toHaveBeenCalledWith(1, 4, 3, record);
      await service.obstacle(2, 3);
      expect(direct.obstacle).toHaveBeenCalledWith(1, 2, 3, record);
      await service.place(1, 0, 0, 1);
      expect(direct.place).toHaveBeenCalledWith(1, 1, 0, 0, 1, record);
      await service.queue(1, ['MOVE', 'LEFT']);
      expect(direct.queue).toHaveBeenCalledWith(1, 1, ['MOVE', 'LEFT'], record);
      await service.delete(1);
      expect(direct.delete).toHaveBeenCalledWith(1, 1, record);
      await expect(service.report()).resolves.toEqual(['EMPTY']);
      expect(direct.report).toHaveBeenCalledWith(1);
      await service.clear();
      expect(direct.clear).toHaveBeenCalled();
    });

    it('scenarioMode defaults to false', () => {
      expect(service.scenarioMode).toBe(false);
    });
  });

  describe('logging', () => {
    type Line = { floorId: number; action: string; params: string };
    type Recorder = (m: EntityManager, line: Line) => Promise<void>;

    /** A direct command that succeeds and records its line, like the real one. */
    function recording(mock: ReturnType<typeof vi.fn>, line: Line) {
      const command = mock as Mock<(...args: unknown[]) => Promise<unknown>>;
      command.mockImplementation(async (...args: unknown[]) => {
        await (args.at(-1) as Recorder)(manager, line);
        return { ok: true, log: line };
      });
    }

    it.each([
      ['floor', () => service.floor(5, 5), 'FLOOR', '5, 5, CREATED'],
      ['obstacle', () => service.obstacle(2, 3), 'OBSTACLE', '2, 3, ON'],
      [
        'place',
        () => service.place(undefined, 2, 3, 0),
        'PLACE',
        'R1 2, 3, NORTH',
      ],
      [
        'queue',
        () => service.queue(1, ['MOVE', 'LEFT']),
        'QUEUE',
        'R1 MOVE LEFT',
      ],
      ['delete', () => service.delete(1), 'DELETE', 'R1'],
    ] as const)(
      '%s records its line with result OK in the command transaction',
      async (name, run, action, params) => {
        recording(direct[name], { floorId: 1, action, params });
        await expect(run()).resolves.toEqual({
          ok: true,
          log: { floorId: 1, action, params },
        });
        expect(logEntries.create).toHaveBeenCalledExactlyOnceWith(
          { floorId: 1, tick: 0, action, params, result: 'OK' },
          manager,
        );
      },
    );

    it('a failed log write rejects the command (its transaction rolls back)', async () => {
      recording(direct.obstacle, {
        floorId: 1,
        action: 'OBSTACLE',
        params: '2, 3, ON',
      });
      logEntries.create.mockRejectedValueOnce(new Error('log down'));
      await expect(service.obstacle(2, 3)).rejects.toThrow('log down');
    });

    it('scenarioMode skips command and tick entries', async () => {
      service.scenarioMode = true;
      recording(direct.place, {
        floorId: 1,
        action: 'PLACE',
        params: 'R1 0, 0, NORTH',
      });
      await service.place(1, 0, 0, 0);
      await service.step();
      expect(logEntries.create).not.toHaveBeenCalled();
    });

    it('step() logs TICK in its transaction with the tick number and the report joined by newlines, after moveAll', async () => {
      direct.report.mockResolvedValue(['R1 0,1,NORTH', 'R2 3,3,EAST']);
      await service.step();
      expect(direct.report).toHaveBeenCalledWith(1, manager);
      expect(logEntries.create).toHaveBeenCalledWith(
        {
          floorId: 1,
          tick: 1,
          action: 'TICK',
          params: '1',
          result: 'R1 0,1,NORTH\nR2 3,3,EAST',
        },
        manager,
      );
      expect(commands.moveAll.mock.invocationCallOrder[0]).toBeLessThan(
        logEntries.create.mock.invocationCallOrder[0],
      );
      await service.step();
      expect(logEntries.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'TICK', params: '2', tick: 2 }),
        manager,
      );
    });

    it('step() with no robots logs EMPTY', async () => {
      await service.step();
      expect(logEntries.create).toHaveBeenCalledWith(
        { floorId: 1, tick: 1, action: 'TICK', params: '1', result: 'EMPTY' },
        manager,
      );
    });

    it('a failed TICK write fails the step and keeps currentTick', async () => {
      logEntries.create.mockRejectedValueOnce(new Error('log down'));
      await expect(service.step()).rejects.toThrow('log down');
      expect(service.currentTick).toBe(0);
    });
  });

  describe('floors', () => {
    it('an automatic tick waiting on the lock is dropped once selectFloor pauses', async () => {
      let release!: () => void;
      const held = lock.run(() => new Promise<void>((r) => (release = r)));
      service.toggle();
      await vi.advanceTimersByTimeAsync(1000);
      expect(doNext).not.toHaveBeenCalled();
      await service.selectFloor(2);
      release();
      await held;
      await vi.advanceTimersByTimeAsync(0);
      expect(doNext).not.toHaveBeenCalled();
      expect(service.tickOf(2)).toBe(0);
      expect(service.tickOf(1)).toBe(0);
    });

    type Line = { floorId: number; action: string; params: string };
    type Recorder = (m: EntityManager, line: Line) => Promise<void>;

    it('a command logged after tick 3 has tick 3; the TICK 4 entry has tick 4', async () => {
      await service.tick(3);
      const line = { floorId: 1, action: 'PLACE', params: 'R1 0, 0, NORTH' };
      const place = direct.place as Mock<
        (...args: unknown[]) => Promise<unknown>
      >;
      place.mockImplementation(async (...args: unknown[]) => {
        await (args.at(-1) as Recorder)(manager, line);
        return { ok: true, log: line };
      });
      await service.place(1, 0, 0, 0);
      expect(logEntries.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'PLACE', tick: 3 }),
        manager,
      );
      await service.step();
      expect(logEntries.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'TICK', params: '4', tick: 4 }),
        manager,
      );
    });

    it("step() advances only the active floor's tick", async () => {
      service.setTick(2, 7);
      await service.step();
      expect(service.tickOf(1)).toBe(1);
      expect(service.tickOf(2)).toBe(7);
    });

    it("selectFloor() stops a running engine and switches currentTick to that floor's tick", async () => {
      service.setTick(2, 7);
      service.toggle();
      await expect(service.selectFloor(2)).resolves.toEqual({ ok: true });
      expect(service.getState()).toMatchObject({
        floorId: 2,
        currentTick: 7,
        running: false,
      });
      await vi.advanceTimersByTimeAsync(3000);
      expect(doNext).not.toHaveBeenCalled();
    });

    it('selectFloor(unknown) is ignored', async () => {
      await expect(service.selectFloor(9)).resolves.toEqual({
        ok: false,
        reason: 'Floor 9 not found',
      });
      expect(service.floorId).toBe(1);
    });

    it('floor() with no active floor creates one and makes it active at tick 0', async () => {
      service.floorId = null;
      direct.floor.mockResolvedValue({
        ok: true,
        log: { floorId: 5, action: 'FLOOR', params: '5, 5, CREATED' },
      });
      await service.floor(5, 5);
      expect(direct.floor).toHaveBeenCalledWith(
        null,
        5,
        5,
        expect.any(Function),
      );
      expect(service.getState()).toMatchObject({ floorId: 5, currentTick: 0 });
    });

    it('getState() includes floorId', () => {
      expect(service.getState().floorId).toBe(1);
    });

    it('step() with no active floor is ignored with No floor', async () => {
      service.floorId = null;
      await expect(service.step()).rejects.toThrow('No floor');
      await expect(service.tick(1)).resolves.toEqual({
        ok: false,
        reason: 'No floor',
      });
      expect(doNext).not.toHaveBeenCalled();
    });
  });
  describe('snapshots', () => {
    it('snapshots at the start of ticks 0, 10, 20 (snapshotFrequency 10), not 1–9', async () => {
      expect(service.snapshotFrequency).toBe(10);
      await service.tick(21);
      expect(history.snapshot.mock.calls).toEqual([
        [manager, 1, 0],
        [manager, 1, 10],
        [manager, 1, 20],
      ]);
      expect(history.snapshot.mock.invocationCallOrder[0]).toBeLessThan(
        doNext.mock.invocationCallOrder[0],
      );
    });

    it('no snapshot in scenarioMode', async () => {
      service.scenarioMode = true;
      await service.tick(11);
      expect(history.snapshot).not.toHaveBeenCalled();
    });

    it('a failed snapshot fails the tick and keeps currentTick', async () => {
      history.snapshot.mockRejectedValueOnce(new Error('disk full'));
      await expect(service.step()).rejects.toThrow('disk full');
      expect(service.currentTick).toBe(0);
    });
  });
});
