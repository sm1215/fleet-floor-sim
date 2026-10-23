import { Test } from '@nestjs/testing';
import { DataSource, EntityManager } from 'typeorm';
import {
  Cell,
  LogEntry,
  QueuedCommand,
  Robot,
} from '../../database/entities/index.js';
import { sqliteTestDb } from '../../test/sqlite-test-db.js';
import { Direction } from '../shared/types.js';
import { EngineModule } from './engine.module.js';
import { EngineService } from './engine.service.js';

/** GOTO runs one pathfinding step per tick (pathfinding.md). */
describe('Engine GOTO (SQLite)', () => {
  let dataSource: DataSource;
  let engine: EngineService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [sqliteTestDb(':memory:'), EngineModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    engine = moduleRef.get(EngineService);
    await engine.floor(5, 5);
    await engine.place(1, 0, 0, Direction.N);
  });

  afterEach(async () => {
    engine.onModuleDestroy();
    await dataSource.destroy();
  });

  /** x, y, direction of a robot. */
  const at = async (displayId: number) => {
    const robot = await dataSource
      .getRepository(Robot)
      .findOneOrFail({ where: { displayId }, relations: { cell: true } });
    return [robot.cell.xPosition, robot.cell.yPosition, robot.direction];
  };
  /** A robot's queue as `COMMAND` or `COMMAND params`. */
  const queueOf = async (displayId: number) => {
    const rows = await dataSource.getRepository(QueuedCommand).find({
      where: { robot: { displayId } },
      order: { id: 'ASC' },
    });
    return rows.map((r) => (r.params ? `${r.command} ${r.params}` : r.command));
  };
  const entries = async () =>
    (
      await dataSource.getRepository(LogEntry).find({ order: { id: 'ASC' } })
    ).map((e) => [e.action, e.params, e.result]);
  const steps = async (n: number) => {
    for (let i = 0; i < n; i++) await engine.step();
  };

  it('walks one cell per tick and finishes on the tick it arrives', async () => {
    await engine.goto(1, 0, 2);
    await engine.step();
    expect(await at(1)).toEqual([0, 1, Direction.N]);
    expect(await queueOf(1)).toEqual(['GOTO 0,2']);
    await engine.step();
    expect(await at(1)).toEqual([0, 2, Direction.N]);
    expect(await queueOf(1)).toEqual([]);
  });

  it('turns for free and moves in the same tick', async () => {
    await engine.goto(1, 2, 0);
    await engine.step();
    expect(await at(1)).toEqual([1, 0, Direction.E]);
  });

  it('equally short first steps prefer NORTH', async () => {
    await engine.goto(1, 1, 1);
    await engine.step();
    expect(await at(1)).toEqual([0, 1, Direction.N]);
  });

  it('already on the target: finishes without moving; the next command runs the tick after', async () => {
    await engine.goto(1, 0, 0);
    await engine.queue(1, ['MOVE']);
    await engine.step();
    expect(await at(1)).toEqual([0, 0, Direction.N]);
    expect(await queueOf(1)).toEqual(['MOVE']);
    await engine.step();
    expect(await at(1)).toEqual([0, 1, Direction.N]);
  });

  it("another robot's cell is a wall", async () => {
    await engine.place(2, 0, 1, Direction.N);
    await engine.goto(1, 0, 2);
    await engine.step();
    expect(await at(1)).toEqual([1, 0, Direction.E]);
  });

  it('reads the floor once per tick, however many robots run a GOTO', async () => {
    const cellReads = async () => {
      const find = vi.spyOn(EntityManager.prototype, 'find');
      await engine.step();
      const count = find.mock.calls.filter(
        ([entity]) => entity === Cell,
      ).length;
      find.mockRestore();
      return count;
    };
    await engine.goto(1, 0, 4);
    await engine.step(); // takes the tick-0 snapshot, which reads cells too
    const one = await cellReads();
    await engine.place(2, 2, 0, Direction.N);
    await engine.place(3, 4, 0, Direction.N);
    await engine.goto(2, 2, 4);
    await engine.goto(3, 4, 4);
    expect(await cellReads()).toBe(one);
  });

  describe('no path', () => {
    beforeEach(async () => {
      await engine.obstacle(2, 2);
      await engine.goto(1, 2, 2);
      await engine.queue(1, ['MOVE']);
    });

    it('waits 2 ticks, then gives up on the 3rd and logs UNREACHABLE before TICK', async () => {
      await steps(2);
      expect(await at(1)).toEqual([0, 0, Direction.N]);
      expect(await queueOf(1)).toEqual(['GOTO 2,2', 'MOVE']);
      expect((await entries()).map(([action]) => action)).not.toContain(
        'UNREACHABLE',
      );
      await engine.step();
      expect(await queueOf(1)).toEqual(['MOVE']);
      expect((await entries()).slice(-2)).toEqual([
        ['UNREACHABLE', 'R1 2, 2', 'OK'],
        ['TICK', '3', 'R1 0,0,NORTH'],
      ]);
      expect(
        await dataSource
          .getRepository(LogEntry)
          .findOneByOrFail({ action: 'UNREACHABLE' }),
      ).toMatchObject({ tick: 3 });
      await engine.step();
      expect(await at(1)).toEqual([0, 1, Direction.N]);
    });

    it('a tick with a path resets the streak', async () => {
      await steps(2);
      await engine.obstacle(2, 2); // off: tick 3 has a path
      await engine.step();
      await engine.obstacle(2, 2); // on again
      await steps(2);
      expect(await queueOf(1)).toEqual(['GOTO 2,2', 'MOVE']);
      await engine.step();
      expect(await queueOf(1)).toEqual(['MOVE']);
    });

    it('scenarioMode: no UNREACHABLE entry, but the GOTO is still dropped on tick 3', async () => {
      engine.scenarioMode = true;
      await steps(3);
      expect(await queueOf(1)).toEqual(['MOVE']);
      expect((await entries()).map(([action]) => action)).not.toContain(
        'UNREACHABLE',
      );
    });

    it('reset() clears the counter', async () => {
      await steps(2);
      await engine.reset(engine.floorId!);
      await steps(2);
      expect(await queueOf(1)).toEqual(['GOTO 2,2', 'MOVE']);
      await engine.step();
      expect(await queueOf(1)).toEqual(['MOVE']);
    });

    it('a deleted robot leaves no count behind', async () => {
      await steps(2);
      await engine.delete(1);
      await engine.place(1, 0, 0, Direction.N);
      await engine.goto(1, 2, 2);
      await steps(2);
      expect(await queueOf(1)).toEqual(['GOTO 2,2']);
    });

    it('a target that holds another robot has no path', async () => {
      await engine.delete(1);
      await engine.place(1, 0, 0, Direction.N);
      await engine.place(2, 4, 4, Direction.N);
      await engine.goto(1, 4, 4);
      await steps(2);
      expect(await queueOf(1)).toEqual(['GOTO 4,4']);
      expect(await at(1)).toEqual([0, 0, Direction.N]);
      await engine.step();
      expect(await queueOf(1)).toEqual([]);
      expect((await entries()).slice(-2)[0]).toEqual([
        'UNREACHABLE',
        'R1 4, 4',
        'OK',
      ]);
    });
  });

  describe('a GOTO MOVE follows the normal MOVE rules', () => {
    it('wins the cell with the lower displayId', async () => {
      await engine.place(2, 2, 0, Direction.W);
      await engine.goto(1, 1, 0);
      await engine.queue(2, ['MOVE']);
      await engine.step();
      expect(await at(1)).toEqual([1, 0, Direction.E]);
      expect(await queueOf(1)).toEqual([]);
      expect(await at(2)).toEqual([2, 0, Direction.W]);
    });

    it('loses with the higher displayId: stays facing the step, GOTO kept', async () => {
      await engine.delete(1);
      await engine.place(2, 0, 0, Direction.N);
      await engine.place(1, 2, 0, Direction.W);
      await engine.goto(2, 1, 0);
      await engine.queue(1, ['MOVE']);
      await engine.step();
      expect(await at(1)).toEqual([1, 0, Direction.W]);
      expect(await at(2)).toEqual([0, 0, Direction.E]);
      expect(await queueOf(2)).toEqual(['GOTO 1,0']);
    });
  });
});
