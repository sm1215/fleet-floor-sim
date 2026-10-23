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
  /** The floor `floor()` created; null until then. */
  let floorId: number | null;

  beforeEach(async () => {
    floorId = null;
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

  /** FLOOR on the test's floor, creating it first time (like the Engine). */
  async function floor(width: number, height: number) {
    const result = await direct.floor(floorId, width, height);
    if (result.ok && result.log) floorId = result.log.floorId;
    return result;
  }

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
    await expect(floor(5, 5)).resolves.toMatchObject({ ok: true });
    expect(await floors()).toHaveLength(1);
    const all = await cells();
    expect(all).toHaveLength(25);
    expect(all.every((c) => !c.obstacle)).toBe(true);
  });

  it('floor resizes the existing floor', async () => {
    await floor(5, 5);
    await expect(floor(4, 3)).resolves.toMatchObject({ ok: true });
    const all = await floors();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ width: 4, height: 3 });
    expect(await cells()).toHaveLength(12);
  });

  it('floor ignores 0, 21 and non-ints', async () => {
    await floor(5, 5);
    for (const [w, h] of [
      [0, 5],
      [5, 21],
      [2.5, 3],
      [NaN, 3],
    ]) {
      expect((await floor(w, h)).ok).toBe(false);
    }
    expect((await floors())[0]).toMatchObject({ width: 5, height: 5 });
    expect(await cells()).toHaveLength(25);
  });

  it('obstacle sets the cell; ignores missing cell and robot cell', async () => {
    expect((await direct.obstacle(floorId, 1, 1)).ok).toBe(false);
    await floor(5, 5);
    await expect(direct.obstacle(floorId, 2, 3)).resolves.toMatchObject({
      ok: true,
    });
    expect((await cellAt(2, 3)).obstacle).toBe(true);
    expect((await direct.obstacle(floorId, 9, 9)).ok).toBe(false);
    await direct.place(floorId, 1, 0, 0, Direction.N);
    expect((await direct.obstacle(floorId, 0, 0)).ok).toBe(false);
    expect((await cellAt(0, 0)).obstacle).toBe(false);
  });

  it('place creates R7 with displayId 7', async () => {
    await floor(5, 5);
    await expect(
      direct.place(floorId, 7, 1, 2, Direction.E),
    ).resolves.toMatchObject({
      ok: true,
    });
    const r = await robot(7);
    expect(r).toMatchObject({ displayId: 7, direction: Direction.E });
    expect(r!.cell).toMatchObject({ xPosition: 1, yPosition: 2 });
  });

  it('place moves and turns an existing robot', async () => {
    await floor(5, 5);
    await direct.place(floorId, 1, 0, 0, Direction.N);
    await expect(
      direct.place(floorId, 1, 3, 4, Direction.W),
    ).resolves.toMatchObject({
      ok: true,
    });
    expect(await dataSource.getRepository(Robot).count()).toBe(1);
    const r = await robot(1);
    expect(r!.direction).toBe(Direction.W);
    expect(r!.cell).toMatchObject({ xPosition: 3, yPosition: 4 });
    await expect(
      direct.place(floorId, 1, 3, 4, Direction.S),
    ).resolves.toMatchObject({
      ok: true,
    });
  });

  it('place onto an Obstacle is ignored', async () => {
    await floor(5, 5);
    await direct.obstacle(floorId, 1, 1);
    expect((await direct.place(floorId, 1, 1, 1, Direction.N)).ok).toBe(false);
    expect(await robot(1)).toBeNull();
  });

  it('place onto another robot is ignored', async () => {
    await floor(5, 5);
    await direct.place(floorId, 1, 1, 1, Direction.N);
    expect((await direct.place(floorId, 2, 1, 1, Direction.N)).ok).toBe(false);
    expect(await robot(2)).toBeNull();
  });

  it('place ignores a direction outside 0..3', async () => {
    await floor(5, 5);
    for (const direction of [4, -1, 1.5, NaN]) {
      expect((await direct.place(floorId, 1, 0, 0, direction)).ok).toBe(false);
    }
    expect(await robot(1)).toBeNull();
  });

  it('place outside the floor is ignored', async () => {
    await floor(5, 5);
    expect((await direct.place(floorId, 1, 5, 0, Direction.N)).ok).toBe(false);
    expect(await robot(1)).toBeNull();
  });

  it('queue enqueues several commands in order', async () => {
    await floor(5, 5);
    await direct.place(floorId, 1, 0, 0, Direction.N);
    await expect(
      direct.queue(floorId, 1, ['MOVE', 'RIGHT', 'MOVE']),
    ).resolves.toMatchObject({ ok: true });
    const rows = await dataSource
      .getRepository(QueuedCommand)
      .find({ order: { id: 'ASC' }, relations: { robot: true } });
    expect(rows.map((r) => r.command)).toEqual(['MOVE', 'RIGHT', 'MOVE']);
    expect(
      rows.every((r) => r.params === null && r.robot.displayId === 1),
    ).toBe(true);
  });

  it('queue ignores unknown robot and rejects the whole list on one bad command', async () => {
    await floor(5, 5);
    expect((await direct.queue(floorId, 9, ['MOVE'])).ok).toBe(false);
    await direct.place(floorId, 1, 0, 0, Direction.N);
    expect((await direct.queue(floorId, 1, [])).ok).toBe(false);
    expect(
      (await direct.queue(floorId, 1, ['MOVE', 'JUMP'] as unknown as ['MOVE']))
        .ok,
    ).toBe(false);
    expect(await dataSource.getRepository(QueuedCommand).count()).toBe(0);
  });

  it('queue returns a result, not an error, when the robot is gone before the insert', async () => {
    await floor(5, 5);
    // The lookup finds a robot whose row no longer exists (deleted meanwhile).
    vi.spyOn(Repository.prototype, 'findOneBy').mockResolvedValueOnce({
      id: 999,
      displayId: 1,
    });
    const result = await direct.queue(floorId, 1, ['MOVE']);
    expect(result.ok).toBe(false);
    expect(await dataSource.getRepository(QueuedCommand).count()).toBe(0);
  });

  it('a robot never ends up on an Obstacle when OBSTACLE races a tick', async () => {
    await floor(5, 5);
    await direct.place(floorId, 1, 0, 0, Direction.E);
    await direct.queue(floorId, 1, ['MOVE']);
    engine.floorId = floorId;
    // Fire OBSTACLE on the target while the tick is persisting the move.
    let racing: Promise<unknown> = Promise.resolve();
    const spy = vi.spyOn(EntityManager.prototype, 'update');
    spy.mockImplementationOnce(async function (this: EntityManager, ...args) {
      spy.mockRestore();
      racing = direct.obstacle(floorId, 1, 0);
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
    await floor(5, 5);
    await expect(direct.report(floorId)).resolves.toEqual(['EMPTY']);
    await direct.place(floorId, 2, 0, 0, Direction.N);
    await direct.place(floorId, 1, 3, 2, Direction.W);
    await expect(direct.report(floorId)).resolves.toEqual([
      'R1 3,2,WEST',
      'R2 0,0,NORTH',
    ]);
  });

  it('clear removes every floor, cell, robot and queued command', async () => {
    await floor(5, 5);
    await direct.place(floorId, 1, 0, 0, Direction.N);
    await direct.queue(floorId, 1, ['MOVE']);
    await direct.clear();
    for (const entity of [Floor, Cell, Robot, QueuedCommand]) {
      expect(await dataSource.getRepository(entity).count()).toBe(0);
    }
  });

  describe('log lines and new behavior', () => {
    it('floor logs CREATED, then RESIZED; a resize with no room is ignored', async () => {
      await expect(floor(5, 5)).resolves.toEqual({
        ok: true,
        log: {
          floorId: expect.any(Number) as number,
          action: 'FLOOR',
          params: '5, 5, CREATED',
        },
      });
      await expect(floor(8, 5)).resolves.toEqual({
        ok: true,
        log: {
          floorId: expect.any(Number) as number,
          action: 'FLOOR',
          params: '8, 5, RESIZED',
        },
      });
      await floor(1, 1);
      await direct.place(floorId, 1, 0, 0, Direction.N);
      await floor(2, 1);
      await direct.place(floorId, 2, 1, 0, Direction.N);
      expect((await floor(1, 1)).ok).toBe(false);
    });

    it('obstacle toggles ON then OFF; ON a robot cell is ignored', async () => {
      await floor(5, 5);
      await expect(direct.obstacle(floorId, 2, 3)).resolves.toEqual({
        ok: true,
        log: {
          floorId: expect.any(Number) as number,
          action: 'OBSTACLE',
          params: '2, 3, ON',
        },
      });
      expect((await cellAt(2, 3)).obstacle).toBe(true);
      await expect(direct.obstacle(floorId, 2, 3)).resolves.toEqual({
        ok: true,
        log: {
          floorId: expect.any(Number) as number,
          action: 'OBSTACLE',
          params: '2, 3, OFF',
        },
      });
      expect((await cellAt(2, 3)).obstacle).toBe(false);
      await direct.place(floorId, 1, 0, 0, Direction.N);
      expect((await direct.obstacle(floorId, 0, 0)).ok).toBe(false);
      expect((await cellAt(0, 0)).obstacle).toBe(false);
    });

    it('place without displayId creates R1 when there are no robots', async () => {
      await floor(5, 5);
      await expect(
        direct.place(floorId, undefined, 2, 3, Direction.N),
      ).resolves.toEqual({
        ok: true,
        log: {
          floorId: expect.any(Number) as number,
          action: 'PLACE',
          params: 'R1 2, 3, NORTH',
        },
      });
      expect(await robot(1)).not.toBeNull();
    });

    it('place without displayId uses the highest displayId + 1 (R1, R3 → R4)', async () => {
      await floor(5, 5);
      await direct.place(floorId, 1, 0, 0, Direction.N);
      await direct.place(floorId, 3, 1, 0, Direction.N);
      await expect(
        direct.place(floorId, undefined, 2, 0, Direction.S),
      ).resolves.toEqual({
        ok: true,
        log: {
          floorId: expect.any(Number) as number,
          action: 'PLACE',
          params: 'R4 2, 0, SOUTH',
        },
      });
      expect((await robot(4))!.cell).toMatchObject({
        xPosition: 2,
        yPosition: 0,
      });
    });

    it('place logs a move and turn of an existing robot, and a place on its own cell', async () => {
      await floor(5, 5);
      await direct.place(floorId, 1, 0, 0, Direction.N);
      await expect(
        direct.place(floorId, 1, 4, 0, Direction.E),
      ).resolves.toEqual({
        ok: true,
        log: {
          floorId: expect.any(Number) as number,
          action: 'PLACE',
          params: 'R1 4, 0, EAST',
        },
      });
      await expect(
        direct.place(floorId, 1, 4, 0, Direction.N),
      ).resolves.toEqual({
        ok: true,
        log: {
          floorId: expect.any(Number) as number,
          action: 'PLACE',
          params: 'R1 4, 0, NORTH',
        },
      });
    });

    it('queue logs the rId and every command', async () => {
      await floor(5, 5);
      await direct.place(floorId, 1, 0, 0, Direction.N);
      await expect(direct.queue(floorId, 1, ['MOVE', 'LEFT'])).resolves.toEqual(
        {
          ok: true,
          log: {
            floorId: expect.any(Number) as number,
            action: 'QUEUE',
            params: 'R1 MOVE LEFT',
          },
        },
      );
    });

    it('delete removes the robot and its queue; unknown robot is ignored', async () => {
      await floor(5, 5);
      await direct.place(floorId, 1, 0, 0, Direction.N);
      await direct.place(floorId, 2, 1, 0, Direction.N);
      await direct.queue(floorId, 1, ['MOVE']);
      await direct.queue(floorId, 2, ['LEFT']);
      await expect(direct.delete(floorId, 1)).resolves.toEqual({
        ok: true,
        log: {
          floorId: expect.any(Number) as number,
          action: 'DELETE',
          params: 'R1',
        },
      });
      expect(await robot(1)).toBeNull();
      const rows = await dataSource
        .getRepository(QueuedCommand)
        .find({ relations: { robot: true } });
      expect(rows.map((r) => r.robot.displayId)).toEqual([2]);
      await expect(direct.delete(floorId, 9)).resolves.toEqual({
        ok: false,
        reason: 'Robot R9 not found',
      });
    });
  });
  describe('per floor', () => {
    /** Creates a floor of its own and returns its id. */
    async function newFloor(): Promise<number> {
      const result = await direct.floor(null, 5, 5);
      if (!result.ok || !result.log) throw new Error('no floor');
      return result.log.floorId;
    }
    const displayIdsOn = async (id: number) =>
      (
        await dataSource.getRepository(Robot).find({
          where: { cell: { floor: { id } } },
          order: { displayId: 'ASC' },
        })
      ).map((r) => r.displayId);

    it('PLACE without rId uses the highest displayId on that floor', async () => {
      const a = await newFloor();
      const b = await newFloor();
      await direct.place(a, 1, 0, 0, Direction.N);
      await direct.place(a, 3, 1, 0, Direction.N);
      await direct.place(b, 7, 0, 0, Direction.N);
      await expect(
        direct.place(a, undefined, 2, 0, Direction.N),
      ).resolves.toMatchObject({ ok: true, log: { params: 'R4 2, 0, NORTH' } });
      expect(await displayIdsOn(a)).toEqual([1, 3, 4]);
      expect(await displayIdsOn(b)).toEqual([7]);
    });

    it('QUEUE / DELETE address the robot by displayId on the given floor only', async () => {
      const a = await newFloor();
      const b = await newFloor();
      await direct.place(a, 1, 0, 0, Direction.N);
      await direct.place(b, 1, 0, 0, Direction.N);
      await direct.queue(b, 1, ['MOVE']);
      const queued = await dataSource
        .getRepository(QueuedCommand)
        .find({ relations: { robot: { cell: { floor: true } } } });
      expect(queued.map((q) => q.robot.cell.floor.id)).toEqual([b]);
      await expect(direct.delete(b, 1)).resolves.toMatchObject({ ok: true });
      expect(await displayIdsOn(a)).toEqual([1]);
      expect(await displayIdsOn(b)).toEqual([]);
    });

    it("report() lists only the given floor's robots", async () => {
      const a = await newFloor();
      const b = await newFloor();
      await direct.place(a, 1, 0, 0, Direction.N);
      await direct.place(b, 2, 1, 1, Direction.E);
      await expect(direct.report(a)).resolves.toEqual(['R1 0,0,NORTH']);
      await expect(direct.report(b)).resolves.toEqual(['R2 1,1,EAST']);
    });

    it('every log line carries its floorId', async () => {
      const a = await newFloor();
      const b = await newFloor();
      expect(a).not.toBe(b);
      const results = [
        await direct.floor(b, 4, 4),
        await direct.obstacle(b, 1, 1),
        await direct.place(b, 1, 0, 0, Direction.N),
        await direct.queue(b, 1, ['MOVE']),
        await direct.delete(b, 1),
      ];
      for (const result of results) {
        expect(result).toMatchObject({ ok: true, log: { floorId: b } });
      }
    });

    it('floor(null) creates a new floor; floor(id) resizes only that one', async () => {
      const a = await newFloor();
      const b = await newFloor();
      await direct.floor(a, 3, 2);
      const all = await dataSource
        .getRepository(Floor)
        .find({ order: { id: 'ASC' } });
      expect(all).toMatchObject([
        { id: a, width: 3, height: 2 },
        { id: b, width: 5, height: 5 },
      ]);
    });
  });
});
