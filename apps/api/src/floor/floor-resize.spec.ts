import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { Cell, Floor, Robot } from '../../database/entities/index.js';
import { sqliteTestDb } from '../../test/sqlite-test-db.js';
import { EngineService } from '../engine/engine.service.js';
import { WriteLock } from '../shared/write-lock.js';
import { RESIZE_NO_ROOM } from './floor.model.js';
import { FloorModule } from './floor.module.js';

/** FLOOR create / resize through the Engine (floor-grid.md, Resize behavior). */
describe('FLOOR resize (SQLite)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let engine: EngineService;
  let cells: Repository<Cell>;
  let robots: Repository<Robot>;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [sqliteTestDb(':memory:'), FloorModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    engine = moduleRef.get(EngineService);
    cells = dataSource.getRepository(Cell);
    robots = dataSource.getRepository(Robot);
  });

  afterEach(async () => {
    engine.onModuleDestroy();
    await dataSource.destroy();
  });

  const floor = () => dataSource.getRepository(Floor).findOneByOrFail({});

  /** Creates the single floor. */
  async function create(width: number, height: number): Promise<Floor> {
    expect(await engine.floor(width, height)).toMatchObject({ ok: true });
    return floor();
  }

  /** Resizes the floor; a missing axis keeps its size. */
  async function resize(size: { width?: number; height?: number }) {
    const current = await floor();
    return engine.floor(
      size.width ?? current.width,
      size.height ?? current.height,
    );
  }

  function cellIds(): Promise<number[]> {
    return cells
      .find({ order: { id: 'ASC' } })
      .then((list) => list.map((c) => c.id));
  }

  function cellAt(x: number, y: number): Promise<Cell> {
    return cells.findOneByOrFail({ xPosition: x, yPosition: y });
  }

  async function markObstacle(x: number, y: number) {
    const cell = await cellAt(x, y);
    await cells.save({ id: cell.id, obstacle: true });
  }

  async function placeRobot(x: number, y: number) {
    const cell = await cellAt(x, y);
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

  async function coords(): Promise<string[]> {
    return (await cells.find())
      .map((c) => `${c.xPosition},${c.yPosition}`)
      .sort();
  }

  it('create makes width×height Open cells', async () => {
    await create(3, 2);
    const list = await cells.find();
    expect(list.every((c) => !c.obstacle)).toBe(true);
    expect(await coords()).toEqual(['0,0', '0,1', '1,0', '1,1', '2,0', '2,1']);
  });

  it('grow creates an Open cell for every new coordinate; existing cells unchanged', async () => {
    await create(2, 2);
    await markObstacle(1, 1);
    const before = await cellAt(1, 1);
    await resize({ width: 3, height: 3 });
    expect(await cells.count()).toBe(9);
    const after = await cellAt(1, 1);
    expect(after.id).toBe(before.id);
    expect(after.obstacle).toBe(true);
    expect(await cells.countBy({ obstacle: true })).toBe(1);
  });

  it('same size is a no-op', async () => {
    await create(3, 3);
    const before = await cellIds();
    await resize({ width: 3, height: 3 });
    expect(await cellIds()).toEqual(before);
  });

  it('shrink deletes cells outside new bounds', async () => {
    await create(4, 4);
    await resize({ width: 2, height: 3 });
    expect(await floor()).toMatchObject({ width: 2, height: 3 });
    expect(await coords()).toEqual(['0,0', '0,1', '0,2', '1,0', '1,1', '1,2']);
  });

  it.each([
    ['grow', { width: 5, height: 5 }],
    ['shrink', { width: 2, height: 2 }],
  ])(
    '%s: robots on cells still inside the bounds keep their cell',
    async (_, size) => {
      await create(3, 3);
      const robot = await placeRobot(1, 1);
      const before = await cellAt(1, 1);
      await resize(size);
      const after = await robots.findOneOrFail({
        where: { id: robot.id },
        relations: { cell: true },
      });
      expect(after.cell.id).toBe(before.id);
      expect(await robotPos(robot.id)).toEqual([1, 1]);
    },
  );

  it('displaced robot moves to nearest free Open cell', async () => {
    await create(5, 5);
    const robot = await placeRobot(4, 2);
    await resize({ width: 3 });
    expect(await robotPos(robot.id)).toEqual([2, 2]);
  });

  it('Manhattan tie → lowest y wins', async () => {
    await create(5, 5);
    await markObstacle(2, 2);
    const robot = await placeRobot(4, 2);
    await resize({ width: 3 });
    expect(await robotPos(robot.id)).toEqual([2, 1]);
  });

  it('Manhattan and y tie → lowest x wins', async () => {
    await create(3, 5);
    await markObstacle(1, 2);
    await markObstacle(1, 1);
    const robot = await placeRobot(1, 4);
    await resize({ height: 3 });
    expect(await robotPos(robot.id)).toEqual([0, 2]);
  });

  it('target excludes Obstacle cells and occupied cells', async () => {
    await create(3, 3);
    const a = await placeRobot(1, 1);
    const b = await placeRobot(2, 2);
    await markObstacle(1, 0);
    await resize({ width: 2, height: 2 });
    expect(await robotPos(b.id)).toEqual([0, 1]);
    expect(await robotPos(a.id)).toEqual([1, 1]);
  });

  it('target is inside the new bounds', async () => {
    await create(5, 5);
    const robot = await placeRobot(4, 4);
    await resize({ width: 4, height: 4 });
    expect(await robotPos(robot.id)).toEqual([3, 3]);
  });

  it('multiple displaced robots placed in ascending Id order, each claiming first', async () => {
    await create(4, 1);
    const id1 = await placeRobot(3, 0);
    const id2 = await placeRobot(2, 0);
    expect(id1.id).toBeLessThan(id2.id);
    await resize({ width: 2 });
    expect(await robotPos(id1.id)).toEqual([1, 0]);
    expect(await robotPos(id2.id)).toEqual([0, 0]);
  });

  it('not enough room → ignored with the reason, and nothing changes', async () => {
    await create(2, 1);
    const a = await placeRobot(0, 0);
    const b = await placeRobot(1, 0);
    const before = await cellIds();

    await expect(resize({ width: 1 })).resolves.toEqual({
      ok: false,
      reason: RESIZE_NO_ROOM,
    });

    expect(await floor()).toMatchObject({ width: 2, height: 1 });
    expect(await cellIds()).toEqual(before);
    expect(await robotPos(a.id)).toEqual([0, 0]);
    expect(await robotPos(b.id)).toEqual([1, 0]);
  });

  it('mixed resize: a displaced robot can move to a newly created cell', async () => {
    await create(1, 3);
    await markObstacle(0, 0);
    await markObstacle(0, 1);
    const robot = await placeRobot(0, 2);
    await resize({ width: 2, height: 2 });
    expect(await robotPos(robot.id)).toEqual([1, 1]);
  });

  it('mixed resize: a nearer new cell beats a farther kept cell', async () => {
    // 2×3 → 3×2, robot at (1,2). Free kept cells: only (0,0), distance 3.
    // New cells: (2,1) distance 2, (2,0) distance 3.
    await create(2, 3);
    await markObstacle(1, 1);
    await markObstacle(0, 1);
    const blocker = await placeRobot(1, 0);
    const robot = await placeRobot(1, 2);
    await resize({ width: 3, height: 2 });
    expect(await robotPos(robot.id)).toEqual([2, 1]);
    expect(await robotPos(blocker.id)).toEqual([1, 0]);
  });

  it('shrink to 1×1 with a robot outside and (0,0) an Obstacle → ignored and nothing changes', async () => {
    await create(2, 2);
    await markObstacle(0, 0);
    const robot = await placeRobot(1, 1);
    const before = await cellIds();
    expect((await resize({ width: 1, height: 1 })).ok).toBe(false);
    expect(await floor()).toMatchObject({ width: 2, height: 2 });
    expect(await cellIds()).toEqual(before);
    expect(await robotPos(robot.id)).toEqual([1, 1]);
  });

  it('resize waits for the write lock, and an ignored resize releases it', async () => {
    await create(5, 5);
    let release!: () => void;
    const lock = moduleRef.get(WriteLock);
    const held = lock.run(() => new Promise<void>((r) => (release = r)));
    const resizing = resize({ width: 3 });
    await new Promise((r) => setTimeout(r, 20));
    expect(await cells.count()).toBe(25);
    release();
    await held;
    await resizing;
    expect(await cells.count()).toBe(15);

    await placeRobot(2, 0);
    await placeRobot(2, 1);
    await placeRobot(2, 2);
    await placeRobot(2, 3);
    await placeRobot(2, 4);
    await placeRobot(1, 4);
    await placeRobot(1, 3);
    await placeRobot(1, 2);
    await placeRobot(1, 1);
    await placeRobot(1, 0);
    await placeRobot(0, 0);
    expect((await resize({ width: 1, height: 1 })).ok).toBe(false);
    await expect(lock.run(() => Promise.resolve('free'))).resolves.toBe('free');
  });
});
