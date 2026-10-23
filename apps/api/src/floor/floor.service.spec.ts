import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import {
  Cell,
  Floor,
  LogEntry,
  QueuedCommand,
  Robot,
  TickHistory,
} from '../../database/entities/index.js';
import { sqliteTestDb } from '../../test/sqlite-test-db.js';
import { EngineService } from '../engine/engine.service.js';
import { WriteLock } from '../shared/write-lock.js';
import { FloorModule } from './floor.module.js';
import { FloorService } from './floor.service.js';

describe('FloorService', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let service: FloorService;
  let engine: EngineService;
  let cells: Repository<Cell>;
  let robots: Repository<Robot>;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [sqliteTestDb(':memory:'), FloorModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    service = moduleRef.get(FloorService);
    engine = moduleRef.get(EngineService);
    cells = dataSource.getRepository(Cell);
    robots = dataSource.getRepository(Robot);
  });

  afterEach(async () => {
    engine.onModuleDestroy();
    await dataSource.destroy();
  });

  /** Creates the single floor through the Engine, as the web does. */
  async function create(width: number, height: number): Promise<Floor> {
    await engine.floor(width, height);
    return dataSource.getRepository(Floor).findOneByOrFail({});
  }

  function cellsOf(floorId: number): Promise<Cell[]> {
    return cells.find({
      where: { floor: { id: floorId } },
      order: { id: 'ASC' },
    });
  }

  async function cellAt(floorId: number, x: number, y: number): Promise<Cell> {
    return cells.findOneByOrFail({
      floor: { id: floorId },
      xPosition: x,
      yPosition: y,
    });
  }

  async function markObstacle(floorId: number, x: number, y: number) {
    const cell = await cellAt(floorId, x, y);
    await cells.save({ id: cell.id, obstacle: true });
  }

  async function placeRobot(floorId: number, x: number, y: number) {
    const cell = await cellAt(floorId, x, y);
    return robots.save(
      robots.create({
        direction: 0,
        displayId: (await robots.count()) + 1,
        cell: { id: cell.id },
      }),
    );
  }

  function coords(list: Cell[]): string[] {
    return list.map((c) => `${c.xPosition},${c.yPosition}`).sort();
  }

  it('findAll returns the floor', async () => {
    const floor = await create(3, 2);
    await expect(service.findAll()).resolves.toEqual([floor]);
  });

  describe('reset', () => {
    it('returns a 5×5 floor with 25 Open cells', async () => {
      const floor = await create(8, 6);
      await markObstacle(floor.id, 0, 0);
      await markObstacle(floor.id, 2, 3);
      await markObstacle(floor.id, 7, 5);
      const reset = await service.reset(floor.id);
      expect(reset).toMatchObject({ width: 5, height: 5 });
      const after = await cellsOf(floor.id);
      expect(after).toHaveLength(25);
      expect(after.every((c) => !c.obstacle)).toBe(true);
      const expected: string[] = [];
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) expected.push(`${x},${y}`);
      }
      expect(coords(after)).toEqual(expected.sort());
    });

    it('deletes robots and their queued commands', async () => {
      const floor = await create(5, 5);
      const commands = dataSource.getRepository(QueuedCommand);
      for (const [x, y] of [
        [0, 0],
        [1, 1],
      ]) {
        const robot = await placeRobot(floor.id, x, y);
        await commands.save({ command: 'MOVE', robot: { id: robot.id } });
      }
      await service.reset(floor.id);
      expect(await robots.count()).toBe(0);
      expect(await commands.count()).toBe(0);
    });

    it('deletes all log entries', async () => {
      const floor = await create(5, 5);
      const logs = dataSource.getRepository(LogEntry);
      await logs.save([
        { action: 'PLACE', params: '', result: 'ok', tick: 0, floor },
        { action: 'MOVE', params: '', result: 'ok', tick: 0, floor },
      ]);
      await service.reset(floor.id);
      expect(await logs.count()).toBe(0);
    });

    it('keeps the floor id', async () => {
      const floor = await create(7, 7);
      const floors = dataSource.getRepository(Floor);
      const before = await floors.count();
      expect((await service.reset(floor.id)).id).toBe(floor.id);
      expect(await floors.count()).toBe(before);
    });

    it('pauses the engine and sets the tick to 0', async () => {
      const floor = await create(5, 5);
      engine.setTick(floor.id, 4);
      engine.toggle();
      await service.reset(floor.id);
      expect(engine.getState()).toMatchObject({
        running: false,
        currentTick: 0,
      });
    });

    it('waits for the write lock', async () => {
      const floor = await create(8, 6);
      let release!: () => void;
      const held = moduleRef
        .get(WriteLock)
        .run(() => new Promise<void>((r) => (release = r)));
      const resetting = service.reset(floor.id);
      await new Promise((r) => setTimeout(r, 20));
      expect(await cellsOf(floor.id)).toHaveLength(48);
      release();
      await held;
      await expect(resetting).resolves.toMatchObject({ width: 5, height: 5 });
      expect(await cellsOf(floor.id)).toHaveLength(25);
    });

    it('throws 404 for a missing floor', async () => {
      await expect(service.reset(999)).rejects.toThrow(NotFoundException);
    });
  });
  describe('per floor', () => {
    /** A second floor with a robot, a queued command, a log entry and a snapshot. */
    async function otherFloor(): Promise<Floor> {
      const floor = await dataSource
        .getRepository(Floor)
        .save({ width: 2, height: 2 });
      const cell = await cells.save({
        obstacle: false,
        xPosition: 0,
        yPosition: 0,
        floor,
      });
      const robot = await robots.save({ displayId: 1, direction: 0, cell });
      await dataSource
        .getRepository(QueuedCommand)
        .save({ command: 'MOVE', params: null, robot });
      await dataSource.getRepository(LogEntry).save({
        action: 'TICK',
        params: '3',
        result: 'EMPTY',
        tick: 3,
        floor,
      });
      await dataSource
        .getRepository(TickHistory)
        .save({ tick: 0, state: '{}', floor });
      return floor;
    }
    const countOn = async (floorId: number) => ({
      cells: await cells.countBy({ floor: { id: floorId } }),
      robots: await robots.countBy({ cell: { floor: { id: floorId } } }),
      queued: await dataSource
        .getRepository(QueuedCommand)
        .countBy({ robot: { cell: { floor: { id: floorId } } } }),
      log: await dataSource
        .getRepository(LogEntry)
        .countBy({ floor: { id: floorId } }),
      snapshots: await dataSource
        .getRepository(TickHistory)
        .countBy({ floor: { id: floorId } }),
    });

    it("reset clears only that floor's log entries and snapshots; another floor's are kept", async () => {
      const floor = await create(5, 5);
      await engine.step();
      const other = await otherFloor();
      await service.reset(floor.id);
      expect(await countOn(floor.id)).toEqual({
        cells: 25,
        robots: 0,
        queued: 0,
        log: 0,
        snapshots: 0,
      });
      expect(await countOn(other.id)).toEqual({
        cells: 1,
        robots: 1,
        queued: 1,
        log: 1,
        snapshots: 1,
      });
    });

    it("reset sets only that floor's tick to 0", async () => {
      const floor = await create(5, 5);
      const other = await otherFloor();
      engine.setTick(floor.id, 4);
      engine.setTick(other.id, 3);
      await service.reset(floor.id);
      expect(engine.tickOf(floor.id)).toBe(0);
      expect(engine.tickOf(other.id)).toBe(3);
    });

    it("deleteFloor removes the floor's cells, robots, queues, log entries and snapshots; other floors are untouched", async () => {
      const floor = await create(5, 5);
      const other = await otherFloor();
      await engine.place(undefined, 1, 1, 0);
      await engine.queue(1, ['MOVE']);
      await engine.step();
      await expect(engine.deleteFloor(floor.id)).resolves.toEqual({
        ok: true,
      });
      expect(await countOn(floor.id)).toEqual({
        cells: 0,
        robots: 0,
        queued: 0,
        log: 0,
        snapshots: 0,
      });
      expect(
        await dataSource.getRepository(Floor).existsBy({ id: floor.id }),
      ).toBe(false);
      expect(await countOn(other.id)).toEqual({
        cells: 1,
        robots: 1,
        queued: 1,
        log: 1,
        snapshots: 1,
      });
    });

    it('deleteFloor of the active floor selects the lowest remaining id', async () => {
      const floor = await create(5, 5);
      const second = await otherFloor();
      const third = await otherFloor();
      engine.setTick(second.id, 3);
      await engine.selectFloor(third.id);
      await engine.deleteFloor(third.id);
      expect(engine.getState()).toMatchObject({
        floorId: floor.id,
        currentTick: 0,
      });
      await engine.deleteFloor(floor.id);
      expect(engine.getState()).toMatchObject({
        floorId: second.id,
        currentTick: 3,
      });
    });

    it('deleteFloor of the last floor creates a 5x5 Open floor and makes it active at tick 0', async () => {
      const floor = await create(3, 3);
      await engine.step();
      engine.toggle();
      await engine.deleteFloor(floor.id);
      const floors = await dataSource.getRepository(Floor).find();
      expect(floors).toHaveLength(1);
      expect(floors[0]).toMatchObject({ width: 5, height: 5 });
      expect(floors[0].id).not.toBe(floor.id);
      expect(engine.getState()).toMatchObject({
        floorId: floors[0].id,
        currentTick: 0,
        running: false,
      });
      expect(await countOn(floors[0].id)).toMatchObject({ cells: 25, log: 1 });
    });

    it('deleteFloor of an unknown floor is ignored', async () => {
      await create(5, 5);
      await expect(engine.deleteFloor(999)).resolves.toEqual({
        ok: false,
        reason: 'Floor 999 not found',
      });
    });
  });
});
