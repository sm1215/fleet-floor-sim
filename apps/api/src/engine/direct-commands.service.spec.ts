import { Test } from '@nestjs/testing';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  Cell,
  Floor,
  QueuedCommand,
  Robot,
} from '../../database/entities/index.js';
import { sqliteTestDb } from '../../test/sqlite-test-db.js';
import { Direction } from '../shared/types.js';
import { DirectCommandsService } from './direct-commands.service.js';
import { EngineModule } from './engine.module.js';
import { EngineService } from './engine.service.js';

describe('DirectCommandsService (SQLite)', () => {
  let dataSource: DataSource;
  let direct: DirectCommandsService;
  let engine: EngineService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [sqliteTestDb(':memory:'), EngineModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    direct = moduleRef.get(DirectCommandsService);
    engine = moduleRef.get(EngineService);
  });

  afterEach(async () => {
    engine.onModuleDestroy();
    await dataSource.destroy();
  });

  const floors = () => dataSource.getRepository(Floor).find();
  const cells = () => dataSource.getRepository(Cell).find();
  const cellAt = (x: number, y: number) =>
    dataSource
      .getRepository(Cell)
      .findOneByOrFail({ xPosition: x, yPosition: y });
  const robot = (displayId: number) =>
    dataSource
      .getRepository(Robot)
      .findOne({ where: { displayId }, relations: { cell: true } });

  it('floor creates a 5x5 Open floor when none exists', async () => {
    await expect(direct.floor(5, 5)).resolves.toEqual({ ok: true });
    expect(await floors()).toHaveLength(1);
    const all = await cells();
    expect(all).toHaveLength(25);
    expect(all.every((c) => !c.obstacle)).toBe(true);
  });

  it('floor resizes the existing floor', async () => {
    await direct.floor(5, 5);
    await expect(direct.floor(4, 3)).resolves.toEqual({ ok: true });
    const all = await floors();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ width: 4, height: 3 });
    expect(await cells()).toHaveLength(12);
  });

  it('floor ignores 0, 21 and non-ints', async () => {
    await direct.floor(5, 5);
    for (const [w, h] of [
      [0, 5],
      [5, 21],
      [2.5, 3],
      [NaN, 3],
    ]) {
      expect((await direct.floor(w, h)).ok).toBe(false);
    }
    expect((await floors())[0]).toMatchObject({ width: 5, height: 5 });
    expect(await cells()).toHaveLength(25);
  });

  it('obstacle sets the cell; ignores missing cell and robot cell', async () => {
    expect((await direct.obstacle(1, 1)).ok).toBe(false);
    await direct.floor(5, 5);
    await expect(direct.obstacle(2, 3)).resolves.toEqual({ ok: true });
    expect((await cellAt(2, 3)).obstacle).toBe(true);
    expect((await direct.obstacle(9, 9)).ok).toBe(false);
    await direct.place(1, 0, 0, Direction.N);
    expect((await direct.obstacle(0, 0)).ok).toBe(false);
    expect((await cellAt(0, 0)).obstacle).toBe(false);
  });

  it('place creates R7 with displayId 7', async () => {
    await direct.floor(5, 5);
    await expect(direct.place(7, 1, 2, Direction.E)).resolves.toEqual({
      ok: true,
    });
    const r = await robot(7);
    expect(r).toMatchObject({ displayId: 7, direction: Direction.E });
    expect(r!.cell).toMatchObject({ xPosition: 1, yPosition: 2 });
  });

  it('place moves and turns an existing robot', async () => {
    await direct.floor(5, 5);
    await direct.place(1, 0, 0, Direction.N);
    await expect(direct.place(1, 3, 4, Direction.W)).resolves.toEqual({
      ok: true,
    });
    expect(await dataSource.getRepository(Robot).count()).toBe(1);
    const r = await robot(1);
    expect(r!.direction).toBe(Direction.W);
    expect(r!.cell).toMatchObject({ xPosition: 3, yPosition: 4 });
    await expect(direct.place(1, 3, 4, Direction.S)).resolves.toEqual({
      ok: true,
    });
  });

  it('place onto an Obstacle is ignored', async () => {
    await direct.floor(5, 5);
    await direct.obstacle(1, 1);
    expect((await direct.place(1, 1, 1, Direction.N)).ok).toBe(false);
    expect(await robot(1)).toBeNull();
  });

  it('place onto another robot is ignored', async () => {
    await direct.floor(5, 5);
    await direct.place(1, 1, 1, Direction.N);
    expect((await direct.place(2, 1, 1, Direction.N)).ok).toBe(false);
    expect(await robot(2)).toBeNull();
  });

  it('place ignores a direction outside 0..3', async () => {
    await direct.floor(5, 5);
    for (const direction of [4, -1, 1.5, NaN]) {
      expect((await direct.place(1, 0, 0, direction)).ok).toBe(false);
    }
    expect(await robot(1)).toBeNull();
  });

  it('place outside the floor is ignored', async () => {
    await direct.floor(5, 5);
    expect((await direct.place(1, 5, 0, Direction.N)).ok).toBe(false);
    expect(await robot(1)).toBeNull();
  });

  it('queue enqueues several commands in order', async () => {
    await direct.floor(5, 5);
    await direct.place(1, 0, 0, Direction.N);
    await expect(direct.queue(1, ['MOVE', 'RIGHT', 'MOVE'])).resolves.toEqual({
      ok: true,
    });
    const rows = await dataSource
      .getRepository(QueuedCommand)
      .find({ order: { id: 'ASC' }, relations: { robot: true } });
    expect(rows.map((r) => r.command)).toEqual(['MOVE', 'RIGHT', 'MOVE']);
    expect(
      rows.every((r) => r.params === null && r.robot.displayId === 1),
    ).toBe(true);
  });

  it('queue ignores unknown robot and rejects the whole list on one bad command', async () => {
    await direct.floor(5, 5);
    expect((await direct.queue(9, ['MOVE'])).ok).toBe(false);
    await direct.place(1, 0, 0, Direction.N);
    expect((await direct.queue(1, [])).ok).toBe(false);
    expect(
      (await direct.queue(1, ['MOVE', 'JUMP'] as unknown as ['MOVE'])).ok,
    ).toBe(false);
    expect(await dataSource.getRepository(QueuedCommand).count()).toBe(0);
  });

  it('queue returns a result, not an error, when the robot is gone before the insert', async () => {
    await direct.floor(5, 5);
    // The lookup finds a robot whose row no longer exists (deleted meanwhile).
    vi.spyOn(Repository.prototype, 'findOneBy').mockResolvedValueOnce({
      id: 999,
      displayId: 1,
    });
    const result = await direct.queue(1, ['MOVE']);
    expect(result.ok).toBe(false);
    expect(await dataSource.getRepository(QueuedCommand).count()).toBe(0);
  });

  it('a robot never ends up on an Obstacle when OBSTACLE races a tick', async () => {
    await direct.floor(5, 5);
    await direct.place(1, 0, 0, Direction.E);
    await direct.queue(1, ['MOVE']);
    // Fire OBSTACLE on the target while the tick is persisting the move.
    let racing: Promise<unknown> = Promise.resolve();
    const spy = vi.spyOn(EntityManager.prototype, 'update');
    spy.mockImplementationOnce(async function (this: EntityManager, ...args) {
      spy.mockRestore();
      racing = direct.obstacle(1, 0);
      await new Promise((r) => setTimeout(r, 50));
      return this.update(...args);
    });
    await engine.tick(1);
    await racing;
    const r = await robot(1);
    expect(r!.cell).toMatchObject({ xPosition: 1, yPosition: 0 });
    expect(r!.cell.obstacle).toBe(false);
  });

  it('report returns sorted lines and EMPTY', async () => {
    await direct.floor(5, 5);
    await expect(direct.report()).resolves.toEqual(['EMPTY']);
    await direct.place(2, 0, 0, Direction.N);
    await direct.place(1, 3, 2, Direction.W);
    await expect(direct.report()).resolves.toEqual([
      'R1 3,2,WEST',
      'R2 0,0,NORTH',
    ]);
  });

  it('clear removes every floor, cell, robot and queued command', async () => {
    await direct.floor(5, 5);
    await direct.place(1, 0, 0, Direction.N);
    await direct.queue(1, ['MOVE']);
    await direct.clear();
    for (const entity of [Floor, Cell, Robot, QueuedCommand]) {
      expect(await dataSource.getRepository(entity).count()).toBe(0);
    }
  });
});
