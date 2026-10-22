import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
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
import { UpdateFloorDto } from './dto/update-floor.dto.js';
import { RESIZE_NO_ROOM } from './floor.model.js';
import { FloorModule } from './floor.module.js';
import { FloorService } from './floor.service.js';

describe('FloorService', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let service: FloorService;
  let cells: Repository<Cell>;
  let robots: Repository<Robot>;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [sqliteTestDb(':memory:'), FloorModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    service = moduleRef.get(FloorService);
    cells = dataSource.getRepository(Cell);
    robots = dataSource.getRepository(Robot);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

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

  async function robotPos(id: number): Promise<[number, number]> {
    const robot = await robots.findOneOrFail({
      where: { id },
      relations: { cell: true },
    });
    return [robot.cell.xPosition, robot.cell.yPosition];
  }

  function coords(list: Cell[]): string[] {
    return list.map((c) => `${c.xPosition},${c.yPosition}`).sort();
  }

  it('rejects width/height outside 1–20', async () => {
    const errors = (v: object) => validate(plainToInstance(UpdateFloorDto, v));
    for (const bad of [
      { width: 0 },
      { width: 21 },
      { height: 0 },
      { height: 21 },
      { width: 1.5 },
    ]) {
      expect((await errors(bad)).length).toBeGreaterThan(0);
    }
    expect(await errors({ width: 1, height: 20 })).toHaveLength(0);
  });

  it('create makes width×height Open cells', async () => {
    const floor = await service.create({ width: 3, height: 2 });
    const list = await cellsOf(floor.id);
    expect(list).toHaveLength(6);
    expect(list.every((c) => !c.obstacle)).toBe(true);
    expect(coords(list)).toEqual(['0,0', '0,1', '1,0', '1,1', '2,0', '2,1']);
  });

  it('grow creates an Open cell for every new coordinate; existing cells unchanged', async () => {
    const floor = await service.create({ width: 2, height: 2 });
    await markObstacle(floor.id, 1, 1);
    const before = await cellAt(floor.id, 1, 1);
    await service.update(floor.id, { width: 3, height: 3 });
    const list = await cellsOf(floor.id);
    expect(list).toHaveLength(9);
    const after = await cellAt(floor.id, 1, 1);
    expect(after.id).toBe(before.id);
    expect(after.obstacle).toBe(true);
    expect(list.filter((c) => c.obstacle)).toHaveLength(1);
  });

  it('same size is a no-op', async () => {
    const floor = await service.create({ width: 3, height: 3 });
    const before = (await cellsOf(floor.id)).map((c) => c.id);
    await service.update(floor.id, { width: 3, height: 3 });
    expect((await cellsOf(floor.id)).map((c) => c.id)).toEqual(before);
  });

  it('shrink deletes cells outside new bounds', async () => {
    const floor = await service.create({ width: 4, height: 4 });
    const updated = await service.update(floor.id, { width: 2, height: 3 });
    expect(updated).toMatchObject({ width: 2, height: 3 });
    expect(coords(await cellsOf(floor.id))).toEqual([
      '0,0',
      '0,1',
      '0,2',
      '1,0',
      '1,1',
      '1,2',
    ]);
  });

  it.each([
    ['grow', { width: 5, height: 5 }],
    ['shrink', { width: 2, height: 2 }],
  ])(
    '%s: robots on cells still inside the bounds keep their cell',
    async (_, size) => {
      const floor = await service.create({ width: 3, height: 3 });
      const robot = await placeRobot(floor.id, 1, 1);
      const before = await cellAt(floor.id, 1, 1);
      await service.update(floor.id, size);
      const after = await robots.findOneOrFail({
        where: { id: robot.id },
        relations: { cell: true },
      });
      expect(after.cell.id).toBe(before.id);
      expect(await robotPos(robot.id)).toEqual([1, 1]);
    },
  );

  it('displaced robot moves to nearest free Open cell', async () => {
    const floor = await service.create({ width: 5, height: 5 });
    const robot = await placeRobot(floor.id, 4, 2);
    await service.update(floor.id, { width: 3 });
    expect(await robotPos(robot.id)).toEqual([2, 2]);
  });

  it('Manhattan tie → lowest y wins', async () => {
    const floor = await service.create({ width: 5, height: 5 });
    await markObstacle(floor.id, 2, 2);
    const robot = await placeRobot(floor.id, 4, 2);
    await service.update(floor.id, { width: 3 });
    expect(await robotPos(robot.id)).toEqual([2, 1]);
  });

  it('Manhattan and y tie → lowest x wins', async () => {
    const floor = await service.create({ width: 3, height: 5 });
    await markObstacle(floor.id, 1, 2);
    await markObstacle(floor.id, 1, 1);
    const robot = await placeRobot(floor.id, 1, 4);
    await service.update(floor.id, { height: 3 });
    expect(await robotPos(robot.id)).toEqual([0, 2]);
  });

  it('target excludes Obstacle cells and occupied cells', async () => {
    const floor = await service.create({ width: 3, height: 3 });
    const a = await placeRobot(floor.id, 1, 1);
    const b = await placeRobot(floor.id, 2, 2);
    await markObstacle(floor.id, 1, 0);
    await service.update(floor.id, { width: 2, height: 2 });
    expect(await robotPos(b.id)).toEqual([0, 1]);
    expect(await robotPos(a.id)).toEqual([1, 1]);
  });

  it('target is inside the new bounds', async () => {
    const floor = await service.create({ width: 5, height: 5 });
    const robot = await placeRobot(floor.id, 4, 4);
    await service.update(floor.id, { width: 4, height: 4 });
    expect(await robotPos(robot.id)).toEqual([3, 3]);
  });

  it('multiple displaced robots placed in ascending Id order, each claiming first', async () => {
    const floor = await service.create({ width: 4, height: 1 });
    const id1 = await placeRobot(floor.id, 3, 0);
    const id2 = await placeRobot(floor.id, 2, 0);
    expect(id1.id).toBeLessThan(id2.id);
    await service.update(floor.id, { width: 2 });
    expect(await robotPos(id1.id)).toEqual([1, 0]);
    expect(await robotPos(id2.id)).toEqual([0, 0]);
  });

  it('not enough room → 409 and nothing changes', async () => {
    const floor = await service.create({ width: 2, height: 1 });
    const a = await placeRobot(floor.id, 0, 0);
    const b = await placeRobot(floor.id, 1, 0);
    const before = (await cellsOf(floor.id)).map((c) => c.id);

    const result = service.update(floor.id, { width: 1 });
    await expect(result).rejects.toThrow(ConflictException);
    await expect(result).rejects.toThrow(RESIZE_NO_ROOM);

    expect(await service.findOne(floor.id)).toMatchObject({
      width: 2,
      height: 1,
    });
    expect((await cellsOf(floor.id)).map((c) => c.id)).toEqual(before);
    expect(await robotPos(a.id)).toEqual([0, 0]);
    expect(await robotPos(b.id)).toEqual([1, 0]);
  });

  it('mixed resize: a displaced robot can move to a newly created cell', async () => {
    const floor = await service.create({ width: 1, height: 3 });
    await markObstacle(floor.id, 0, 0);
    await markObstacle(floor.id, 0, 1);
    const robot = await placeRobot(floor.id, 0, 2);
    await service.update(floor.id, { width: 2, height: 2 });
    expect(await robotPos(robot.id)).toEqual([1, 1]);
  });

  it('mixed resize: a nearer new cell beats a farther kept cell', async () => {
    // 2×3 → 3×2, robot at (1,2). Free kept cells: only (0,0), distance 3.
    // New cells: (2,1) distance 2, (2,0) distance 3.
    const floor = await service.create({ width: 2, height: 3 });
    await markObstacle(floor.id, 1, 1);
    await markObstacle(floor.id, 0, 1);
    const blocker = await placeRobot(floor.id, 1, 0);
    const robot = await placeRobot(floor.id, 1, 2);
    await service.update(floor.id, { width: 3, height: 2 });
    expect(await robotPos(robot.id)).toEqual([2, 1]);
    expect(await robotPos(blocker.id)).toEqual([1, 0]);
  });

  it('shrink to 1×1 with a robot outside and (0,0) an Obstacle → 409 and nothing changes', async () => {
    const floor = await service.create({ width: 2, height: 2 });
    await markObstacle(floor.id, 0, 0);
    const robot = await placeRobot(floor.id, 1, 1);
    const before = (await cellsOf(floor.id)).map((c) => c.id);
    await expect(
      service.update(floor.id, { width: 1, height: 1 }),
    ).rejects.toThrow(RESIZE_NO_ROOM);
    expect(await service.findOne(floor.id)).toMatchObject({
      width: 2,
      height: 2,
    });
    expect((await cellsOf(floor.id)).map((c) => c.id)).toEqual(before);
    expect(await robotPos(robot.id)).toEqual([1, 1]);
  });

  it('remove deletes the floor and its cells', async () => {
    const floor = await service.create({ width: 2, height: 2 });
    await service.remove(floor.id);
    await expect(service.findOne(floor.id)).rejects.toThrow(NotFoundException);
    expect(await cellsOf(floor.id)).toHaveLength(0);
  });

  it('throws 404 when the floor is missing', async () => {
    await expect(service.findOne(9)).rejects.toThrow(NotFoundException);
    await expect(service.update(9, { width: 6 })).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.remove(9)).rejects.toThrow(NotFoundException);
  });

  /** Holds the write lock until the returned release() is called. */
  function holdLock() {
    let release!: () => void;
    const held = moduleRef
      .get(WriteLock)
      .run(() => new Promise<void>((r) => (release = r)));
    return { held, release: () => release() };
  }

  const settle = () => new Promise((r) => setTimeout(r, 20));

  it('update waits for the write lock', async () => {
    const floor = await service.create({ width: 5, height: 5 });
    const lock = holdLock();
    const updating = service.update(floor.id, { width: 3 });
    await settle();
    expect(await cellsOf(floor.id)).toHaveLength(25);
    lock.release();
    await lock.held;
    await expect(updating).resolves.toMatchObject({ width: 3 });
    expect(await cellsOf(floor.id)).toHaveLength(15);
  });

  it('a 409 resize releases the write lock', async () => {
    const floor = await service.create({ width: 1, height: 2 });
    await robots.save({
      displayId: 1,
      direction: 0,
      cell: await cellAt(floor.id, 0, 1),
    });
    await markObstacle(floor.id, 0, 0);
    await expect(service.update(floor.id, { height: 1 })).rejects.toThrow(
      ConflictException,
    );
    await expect(
      moduleRef.get(WriteLock).run(() => Promise.resolve('free')),
    ).resolves.toBe('free');
  });

  describe('reset', () => {
    it('returns a 5×5 floor with 25 Open cells', async () => {
      const floor = await service.create({ width: 8, height: 6 });
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
      const floor = await service.create({ width: 5, height: 5 });
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
      const floor = await service.create({ width: 5, height: 5 });
      const logs = dataSource.getRepository(LogEntry);
      await logs.save([
        { action: 'PLACE', params: '', result: 'ok' },
        { action: 'MOVE', params: '', result: 'ok' },
      ]);
      await service.reset(floor.id);
      expect(await logs.count()).toBe(0);
    });

    it('keeps the floor id', async () => {
      const floor = await service.create({ width: 7, height: 7 });
      const floors = dataSource.getRepository(Floor);
      const before = await floors.count();
      expect((await service.reset(floor.id)).id).toBe(floor.id);
      expect(await floors.count()).toBe(before);
    });

    it('pauses the engine and sets the tick to 0', async () => {
      const floor = await service.create({ width: 5, height: 5 });
      const engine = moduleRef.get(EngineService);
      engine.currentTick = 4;
      engine.toggle();
      await service.reset(floor.id);
      expect(engine.getState()).toMatchObject({
        running: false,
        currentTick: 0,
      });
    });

    it('waits for the write lock', async () => {
      const floor = await service.create({ width: 8, height: 6 });
      const lock = holdLock();
      const resetting = service.reset(floor.id);
      await settle();
      expect(await cellsOf(floor.id)).toHaveLength(48);
      lock.release();
      await lock.held;
      await expect(resetting).resolves.toMatchObject({ width: 5, height: 5 });
      expect(await cellsOf(floor.id)).toHaveLength(25);
    });

    it('throws 404 for a missing floor', async () => {
      await expect(service.reset(999)).rejects.toThrow(NotFoundException);
    });
  });
});
