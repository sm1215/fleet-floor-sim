import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { LogEntry, TickHistory } from '../../database/entities/index.js';
import { sqliteTestDb } from '../../test/sqlite-test-db.js';
import { EngineModule } from '../engine/engine.module.js';
import { EngineService } from '../engine/engine.service.js';
import { QueueService } from '../queue/queue.service.js';
import { Direction } from '../shared/types.js';
import type { FloorState } from './floor-state.js';
import { HistoryService } from './history.service.js';

describe('HistoryService (SQLite)', () => {
  let dataSource: DataSource;
  let engine: EngineService;
  let history: HistoryService;
  let queue: QueueService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [sqliteTestDb(':memory:'), EngineModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    engine = moduleRef.get(EngineService);
    history = moduleRef.get(HistoryService);
    queue = moduleRef.get(QueueService);
  });

  afterEach(async () => {
    engine.onModuleDestroy();
    await dataSource.destroy();
  });

  const floorId = () => engine.floorId!;
  const live = () => history.liveState(dataSource.manager, floorId());
  const stateAt = (tick: number) =>
    history.stateAt(dataSource.manager, floorId(), tick, engine.currentTick);

  /**
   * Commands run before stepping out of each tick: so the state recorded for
   * tick t includes them (timeline.md).
   */
  const script: Record<number, () => Promise<unknown>> = {
    0: async () => {
      await engine.floor(6, 6);
      // Placed out of displayId order, so robot ids differ from displayIds.
      await engine.place(3, 4, 0, Direction.N);
      await engine.place(1, 0, 0, Direction.E);
      await engine.place(2, 5, 5, Direction.S);
      await engine.queue(1, ['MOVE', 'MOVE', 'LEFT', 'MOVE']);
      await engine.queue(2, ['MOVE', 'RIGHT', 'MOVE']);
      await engine.queue(3, ['MOVE', 'MOVE']);
    },
    3: () => engine.obstacle(2, 2),
    5: () => engine.queue(3, ['LEFT', 'MOVE', 'MOVE', 'RIGHT']),
    8: async () => {
      await engine.obstacle(2, 2);
      await engine.obstacle(0, 5);
    },
    12: async () => {
      // R3 (id 1) and R2 (id 3) will both be displaced by the 4x4 resize.
      await engine.place(3, 4, 3, Direction.W);
      await engine.place(2, 5, 3, Direction.W);
      await engine.place(1, 0, 0, Direction.N);
      await engine.queue(1, ['MOVE', 'RIGHT', 'MOVE', 'MOVE']);
    },
    13: () => engine.floor(4, 4),
    15: () => engine.queue(2, ['LEFT', 'MOVE', 'MOVE']),
    17: () => engine.delete(3),
    21: () => engine.queue(1, ['LEFT', 'LEFT', 'MOVE']),
  };

  async function play(lastTick: number): Promise<FloorState[]> {
    const recorded: FloorState[] = [];
    for (let t = 0; t <= lastTick; t++) {
      await script[t]?.();
      recorded.push(await live());
      if (t < lastTick) await engine.step();
    }
    return recorded;
  }

  it('stateAt(t) equals the live state recorded at each tick t from 0 to 25', async () => {
    const recorded = await play(25);
    // The script really displaced robots at tick 13.
    expect(recorded[13].width).toBe(4);
    expect(recorded[12].robots.map((r) => r.x)).toContain(5);
    for (let t = 0; t <= 25; t++) {
      expect({ t, state: await stateAt(t) }).toEqual({
        t,
        state: recorded[t],
      });
    }
  });

  it('stateAt(currentTick) is the live state, including commands since the last tick', async () => {
    await play(3);
    await engine.place(undefined, 5, 0, Direction.W);
    await engine.queue(1, ['RIGHT']);
    expect(await stateAt(3)).toEqual(await live());
    expect((await live()).robots).toHaveLength(4);
  });

  it('stateAt with no snapshot ≤ tick returns null', async () => {
    await play(4);
    await dataSource.getRepository(TickHistory).clear();
    expect(await stateAt(2)).toBeNull();
  });

  it('a failed tick rolls its snapshot back', async () => {
    await engine.floor(5, 5);
    vi.spyOn(queue, 'doNext').mockRejectedValueOnce(new Error('boom'));
    await expect(engine.step()).rejects.toThrow('boom');
    expect(await dataSource.getRepository(TickHistory).count()).toBe(0);
    await engine.step();
    expect(await dataSource.getRepository(TickHistory).count()).toBe(1);
  });

  it('liveState lists cells by y then x, robots by displayId, queues in FIFO order', async () => {
    await engine.floor(2, 2);
    await engine.place(2, 1, 1, Direction.W);
    await engine.place(1, 0, 0, Direction.N);
    await engine.queue(2, ['MOVE', 'LEFT']);
    expect(await live()).toEqual({
      width: 2,
      height: 2,
      cells: [
        { x: 0, y: 0, obstacle: false },
        { x: 1, y: 0, obstacle: false },
        { x: 0, y: 1, obstacle: false },
        { x: 1, y: 1, obstacle: false },
      ],
      robots: [
        {
          id: expect.any(Number) as number,
          displayId: 1,
          x: 0,
          y: 0,
          direction: Direction.N,
          queue: [],
        },
        {
          id: expect.any(Number) as number,
          displayId: 2,
          x: 1,
          y: 1,
          direction: Direction.W,
          queue: ['MOVE', 'LEFT'],
        },
      ],
    });
  });
  describe('fork', () => {
    /** Robot ids differ on a fork; their order is what replay relies on. */
    const withoutIds = (state: FloorState | null) =>
      state && {
        ...state,
        robots: state.robots.map((r) => ({ ...r, id: undefined })),
        robotOrder: [...state.robots]
          .sort((a, b) => a.id - b.id)
          .map((r) => r.displayId),
      };
    const at = (id: number, tick: number) =>
      history.stateAt(dataSource.manager, id, tick, engine.tickOf(id));
    const forkAt = async (tick: number) => {
      const result = await engine.fork(engine.floorId!, tick);
      if (!result.ok) throw new Error(result.reason);
      return result.floorId;
    };
    const entriesOf = (id: number) =>
      dataSource.getRepository(LogEntry).find({
        where: { floor: { id } },
        order: { id: 'ASC' },
      });

    it("fork at tick 12 of 25: new floor's live state equals source stateAt(12), including queues", async () => {
      await play(25);
      const source = floorId();
      const expected = await at(source, 12);
      const fork = await forkAt(12);
      expect(fork).not.toBe(source);
      const forked = await history.liveState(dataSource.manager, fork);
      expect(withoutIds(forked)).toEqual(withoutIds(expected));
      expect(forked.robots.some((r) => r.queue.length > 0)).toBe(true);
    });

    it("fork's history: stateAt(t) on the fork equals stateAt(t) on the source for t = 0..12", async () => {
      await play(25);
      const source = floorId();
      const fork = await forkAt(12);
      for (let t = 0; t <= 12; t++) {
        expect({ t, s: withoutIds(await at(fork, t)) }).toEqual({
          t,
          s: withoutIds(await at(source, t)),
        });
      }
    });

    it('fork of a fork (fork at 12, step 5, fork that at 8): stateAt(0..8) matches the original floor', async () => {
      await play(25);
      const source = floorId();
      const first = await forkAt(12);
      await engine.tick(5);
      expect(engine.tickOf(first)).toBe(17);
      const second = await forkAt(8);
      expect(engine.floorId).toBe(second);
      for (let t = 0; t <= 8; t++) {
        expect({ t, s: withoutIds(await at(second, t)) }).toEqual({
          t,
          s: withoutIds(await at(source, t)),
        });
      }
    });

    it("fork leaves the source floor's cells, robots, log and snapshots unchanged", async () => {
      await play(25);
      const source = floorId();
      const before = {
        live: await history.liveState(dataSource.manager, source),
        log: await entriesOf(source),
        snapshots: await dataSource
          .getRepository(TickHistory)
          .find({ where: { floor: { id: source } }, order: { id: 'ASC' } }),
      };
      await forkAt(12);
      expect({
        live: await history.liveState(dataSource.manager, source),
        log: await entriesOf(source),
        snapshots: await dataSource
          .getRepository(TickHistory)
          .find({ where: { floor: { id: source } }, order: { id: 'ASC' } }),
      }).toEqual(before);
      expect(engine.tickOf(source)).toBe(25);
    });

    it('fork selects the new floor at tick <t> and pauses the engine', async () => {
      await play(14);
      engine.toggle();
      const fork = await forkAt(12);
      expect(engine.getState()).toMatchObject({
        floorId: fork,
        currentTick: 12,
        running: false,
      });
    });

    it('fork writes no log entry beyond the copies', async () => {
      await play(25);
      const source = floorId();
      const fork = await forkAt(12);
      const copied = (await entriesOf(source)).filter((e) => e.tick <= 12);
      const forkLog = await entriesOf(fork);
      expect(
        forkLog.map((e) => [e.action, e.params, e.result, e.tick]),
      ).toEqual(copied.map((e) => [e.action, e.params, e.result, e.tick]));
    });

    it('fork validates like history', async () => {
      await play(3);
      await expect(engine.fork(floorId(), 4)).resolves.toEqual({
        ok: false,
        reason: 'Tick must be an int from 0 to 3',
      });
      await expect(engine.fork(99, 0)).resolves.toEqual({
        ok: false,
        reason: 'Floor 99 not found',
      });
    });

    it('fork copies a long log (over one insert chunk) in order', async () => {
      await play(3);
      const source = floorId();
      // 1200 obstacle toggles at tick 1: an even count leaves the cell Open.
      await dataSource.getRepository(LogEntry).insert(
        Array.from({ length: 1200 }, (_, i) => ({
          action: 'OBSTACLE',
          params: `4, 4, ${i % 2 === 0 ? 'ON' : 'OFF'}`,
          result: 'OK',
          tick: 1,
          floor: { id: source },
        })),
      );
      const fork = await forkAt(3);
      const shape = (id: number) =>
        entriesOf(id).then((es) => es.map((e) => [e.action, e.params, e.tick]));
      expect(await shape(fork)).toEqual(await shape(source));
      expect((await entriesOf(fork)).length).toBeGreaterThan(1200);
    });

    it('an automatic tick that fires during a fork does not advance the paused fork', async () => {
      await play(4);
      // The fork's copy takes long enough for the play timer to fire meanwhile.
      const copy = history.fork.bind(history);
      vi.spyOn(history, 'fork').mockImplementationOnce(async (...args) => {
        await new Promise((r) => setTimeout(r, 40));
        return copy(...args);
      });
      engine.tickRate = 5;
      engine.toggle();
      const fork = await forkAt(2);
      await new Promise((r) => setTimeout(r, 40));
      expect(engine.getState()).toMatchObject({
        floorId: fork,
        currentTick: 2,
        running: false,
      });
      expect(
        (await entriesOf(fork))
          .filter((e) => e.action === 'TICK')
          .map((e) => e.params),
      ).toEqual(['1', '2']);
    });

    it('stepping a fork made at a snapshot tick replaces that copied snapshot', async () => {
      await play(12);
      await forkAt(10);
      await expect(engine.step()).resolves.toMatchObject({ currentTick: 11 });
    });
  });
});
