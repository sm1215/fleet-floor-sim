import { Test } from '@nestjs/testing';
import { DataSource, ObjectLiteral, Repository } from 'typeorm';
import {
  Cell,
  LogEntry,
  QueuedCommand,
  Robot,
} from '../../database/entities/index.js';
import { sqliteTestDb } from '../../test/sqlite-test-db.js';
import { LogEntryService } from '../log-entry/log-entry.service.js';
import { Direction } from '../shared/types.js';
import { EngineModule } from './engine.module.js';
import { EngineService } from './engine.service.js';

/** No change is saved without its log entry (log-entry.md). */
describe('Engine logging (SQLite)', () => {
  let dataSource: DataSource;
  let engine: EngineService;
  let logEntries: LogEntryService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [sqliteTestDb(':memory:'), EngineModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    engine = moduleRef.get(EngineService);
    logEntries = moduleRef.get(LogEntryService);
    await engine.floor(5, 5);
  });

  afterEach(async () => {
    engine.onModuleDestroy();
    await dataSource.destroy();
  });

  const entries = () =>
    dataSource.getRepository(LogEntry).find({ order: { id: 'ASC' } });
  const robot = (displayId: number) =>
    dataSource
      .getRepository(Robot)
      .findOne({ where: { displayId }, relations: { cell: true } });
  const cellAt = (x: number, y: number) =>
    dataSource
      .getRepository(Cell)
      .findOneByOrFail({ xPosition: x, yPosition: y });
  const failNextLog = () =>
    vi.spyOn(logEntries, 'create').mockRejectedValueOnce(new Error('log down'));

  it('a command and its entry are saved together', async () => {
    await engine.place(undefined, 2, 3, Direction.N);
    expect(await robot(1)).not.toBeNull();
    expect((await entries()).map((e) => e.action)).toEqual(['FLOOR', 'PLACE']);
  });

  describe('a failed log write rolls the command back', () => {
    beforeEach(async () => {
      await engine.place(1, 0, 0, Direction.N);
      await engine.queue(1, ['MOVE']);
    });

    it('PLACE (new robot and move)', async () => {
      failNextLog();
      await expect(engine.place(undefined, 2, 3, Direction.N)).rejects.toThrow(
        'log down',
      );
      expect(await robot(2)).toBeNull();
      failNextLog();
      await expect(engine.place(1, 4, 4, Direction.S)).rejects.toThrow();
      expect((await robot(1))!.cell).toMatchObject({
        xPosition: 0,
        yPosition: 0,
      });
      expect((await robot(1))!.direction).toBe(Direction.N);
    });

    it('OBSTACLE', async () => {
      failNextLog();
      await expect(engine.obstacle(2, 2)).rejects.toThrow();
      expect((await cellAt(2, 2)).obstacle).toBe(false);
    });

    it('QUEUE', async () => {
      failNextLog();
      await expect(engine.queue(1, ['LEFT', 'RIGHT'])).rejects.toThrow();
      expect(await dataSource.getRepository(QueuedCommand).count()).toBe(1);
    });

    it('DELETE', async () => {
      failNextLog();
      await expect(engine.delete(1)).rejects.toThrow();
      expect(await robot(1)).not.toBeNull();
      expect(await dataSource.getRepository(QueuedCommand).count()).toBe(1);
    });

    it('FLOOR', async () => {
      failNextLog();
      await expect(engine.floor(8, 8)).rejects.toThrow();
      expect(await dataSource.getRepository(Cell).count()).toBe(25);
    });

    it('nothing is logged for the failed command', async () => {
      failNextLog();
      await engine.obstacle(2, 2).catch(() => undefined);
      expect((await entries()).map((e) => e.action)).toEqual([
        'FLOOR',
        'PLACE',
        'QUEUE',
      ]);
    });
  });

  it('a dequeue failing mid-tick deletes no other robot’s command, even after the rollback', async () => {
    await engine.place(1, 0, 0, Direction.N);
    await engine.place(2, 3, 3, Direction.N);
    await engine.queue(1, ['MOVE']);
    await engine.queue(2, ['RIGHT']);
    const r1 = (await robot(1))!.id;
    type FindOne = Repository<ObjectLiteral>['findOne'];
    const findOne = Object.getOwnPropertyDescriptor(
      Repository.prototype,
      'findOne',
    )!.value as FindOne;
    // R1's dequeue fails; R2's is still reading its queue when that happens.
    vi.spyOn(Repository.prototype, 'findOne').mockImplementation(
      async function (this: Repository<ObjectLiteral>, options) {
        const robotId = (options.where as { robot?: { id: number } }).robot?.id;
        if (robotId === r1) throw new Error('dequeue failed');
        if (robotId !== undefined) await new Promise((r) => setTimeout(r, 30));
        return findOne.call(this, options);
      },
    );
    await expect(engine.step()).rejects.toThrow('dequeue failed');
    await new Promise((r) => setTimeout(r, 60));
    vi.restoreAllMocks();
    expect(await dataSource.getRepository(QueuedCommand).count()).toBe(2);
  });

  it('a failed TICK write rolls the whole tick back and keeps the tick number', async () => {
    await engine.place(1, 0, 0, Direction.N);
    await engine.place(2, 3, 3, Direction.N);
    await engine.queue(1, ['MOVE']);
    await engine.queue(2, ['RIGHT']);
    failNextLog();
    await expect(engine.step()).rejects.toThrow('log down');
    expect(engine.currentTick).toBe(0);
    expect((await robot(1))!.cell).toMatchObject({ yPosition: 0 });
    expect((await robot(2))!.direction).toBe(Direction.N);
    expect(await dataSource.getRepository(QueuedCommand).count()).toBe(2);
    expect((await entries()).map((e) => e.action)).not.toContain('TICK');

    await engine.step();
    expect((await entries()).at(-1)).toMatchObject({
      action: 'TICK',
      params: '1',
      result: 'R1 0,1,NORTH\nR2 3,3,EAST',
    });
  });

  it('a tick never logs between a command and its entry', async () => {
    await engine.place(1, 0, 0, Direction.N);
    const create = logEntries.create.bind(logEntries);
    // Hold the QUEUE entry's write open while a step is requested.
    vi.spyOn(logEntries, 'create').mockImplementationOnce(async (...args) => {
      stepping = engine.step();
      await new Promise((r) => setTimeout(r, 50));
      return create(...args);
    });
    let stepping: Promise<unknown> = Promise.resolve();
    await engine.queue(1, ['MOVE']);
    await stepping;
    expect((await entries()).map((e) => [e.action, e.params])).toEqual([
      ['FLOOR', '5, 5, CREATED'],
      ['PLACE', 'R1 0, 0, NORTH'],
      ['QUEUE', 'R1 MOVE'],
      ['TICK', '1'],
    ]);
    expect((await entries()).at(-1)!.result).toBe('R1 0,1,NORTH');
  });
});
