import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import {
  Cell,
  Floor,
  LogEntry,
  QueuedCommand,
  Robot,
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
        { action: 'PLACE', params: '', result: 'ok' },
        { action: 'MOVE', params: '', result: 'ok' },
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
      engine.currentTick = 4;
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
});
