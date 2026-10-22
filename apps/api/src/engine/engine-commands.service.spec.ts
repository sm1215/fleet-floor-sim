import { Test } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import {
  Cell,
  Floor,
  QueuedCommand,
  Robot,
} from '../../database/entities/index.js';
import { sqliteTestDb } from '../../test/sqlite-test-db.js';
import { Direction } from '../shared/types.js';
import { EngineCommandsService } from './engine-commands.service.js';
import { EngineModule } from './engine.module.js';
import { EngineService } from './engine.service.js';
import { BLOCKED_BY_OBSTACLE, BLOCKED_BY_WALL } from './resolve-moves.js';

describe('Engine commands (SQLite)', () => {
  let dataSource: DataSource;
  let commands: EngineCommandsService;
  let engine: EngineService;
  let robots: Repository<Robot>;
  let cells: Repository<Cell>;
  let floorId: number;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [sqliteTestDb(':memory:'), EngineModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    commands = moduleRef.get(EngineCommandsService);
    engine = moduleRef.get(EngineService);
    robots = dataSource.getRepository(Robot);
    cells = dataSource.getRepository(Cell);

    const floor = await dataSource
      .getRepository(Floor)
      .save({ width: 3, height: 3 });
    floorId = floor.id;
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        await cells.save({
          obstacle: false,
          xPosition: x,
          yPosition: y,
          floor: { id: floorId },
        });
      }
    }
  });

  afterEach(async () => {
    engine.onModuleDestroy();
    await dataSource.destroy();
  });

  function cellAt(x: number, y: number): Promise<Cell> {
    return cells.findOneByOrFail({
      floor: { id: floorId },
      xPosition: x,
      yPosition: y,
    });
  }

  async function place(
    displayId: number,
    x: number,
    y: number,
    direction: Direction,
  ): Promise<Robot> {
    const cell = await cellAt(x, y);
    return robots.save({ displayId, direction, cell: { id: cell.id } });
  }

  async function stored(id: number) {
    const robot = await robots.findOneOrFail({
      where: { id },
      relations: { cell: true },
    });
    return {
      x: robot.cell.xPosition,
      y: robot.cell.yPosition,
      direction: robot.direction,
    };
  }

  it('LEFT: N→W→S→E→N, persisted', async () => {
    const robot = await place(1, 1, 1, Direction.N);
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      await commands.left(robot.id);
      seen.push((await stored(robot.id)).direction);
    }
    expect(seen).toEqual([Direction.W, Direction.S, Direction.E, Direction.N]);
  });

  it('RIGHT: N→E→S→W→N, persisted', async () => {
    const robot = await place(1, 1, 1, Direction.N);
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      await commands.right(robot.id);
      seen.push((await stored(robot.id)).direction);
    }
    expect(seen).toEqual([Direction.E, Direction.S, Direction.W, Direction.N]);
  });

  it('moveAll persists new cells; blocked robots stay', async () => {
    const mover = await place(1, 0, 0, Direction.N);
    const walled = await place(2, 2, 2, Direction.N);
    const blocks = await commands.moveAll([mover.id, walled.id]);
    expect(await stored(mover.id)).toMatchObject({ x: 0, y: 1 });
    expect(await stored(walled.id)).toMatchObject({ x: 2, y: 2 });
    expect(blocks).toEqual([{ robotId: walled.id, reason: BLOCKED_BY_WALL }]);
  });

  it('moveAll into an Obstacle → Blocked by obstacle, no change', async () => {
    const robot = await place(1, 0, 0, Direction.E);
    await cells.update((await cellAt(1, 0)).id, { obstacle: true });
    const blocks = await commands.moveAll([robot.id]);
    expect(blocks).toEqual([
      { robotId: robot.id, reason: BLOCKED_BY_OBSTACLE },
    ]);
    expect(await stored(robot.id)).toMatchObject({ x: 0, y: 0 });
  });

  it('moveAll resolves together: a 4-robot loop all move', async () => {
    const a = await place(1, 0, 0, Direction.N);
    const b = await place(2, 0, 1, Direction.E);
    const c = await place(3, 1, 1, Direction.S);
    const d = await place(4, 1, 0, Direction.W);
    await commands.moveAll([a.id, b.id, c.id, d.id]);
    expect(await stored(a.id)).toMatchObject({ x: 0, y: 1 });
    expect(await stored(b.id)).toMatchObject({ x: 1, y: 1 });
    expect(await stored(c.id)).toMatchObject({ x: 1, y: 0 });
    expect(await stored(d.id)).toMatchObject({ x: 0, y: 0 });
  });

  describe('step()', () => {
    async function enqueue(robot: Robot, ...names: string[]) {
      for (const command of names) {
        await dataSource
          .getRepository(QueuedCommand)
          .save({ command, params: null, robot: { id: robot.id } });
      }
    }

    it('consumes each queue FIFO, one command per robot per tick, and persists', async () => {
      const r1 = await place(1, 0, 0, Direction.N);
      const r2 = await place(2, 2, 0, Direction.N);
      await enqueue(r1, 'MOVE', 'RIGHT');
      await enqueue(r2, 'LEFT');

      await engine.step();
      expect(await stored(r1.id)).toEqual({
        x: 0,
        y: 1,
        direction: Direction.N,
      });
      expect(await stored(r2.id)).toEqual({
        x: 2,
        y: 0,
        direction: Direction.W,
      });

      await engine.step();
      expect(await stored(r1.id)).toEqual({
        x: 0,
        y: 1,
        direction: Direction.E,
      });
      expect(await dataSource.getRepository(QueuedCommand).count()).toBe(0);
    });

    it('a robot turning and one moving into its cell in the same tick: the turner stays, so the mover is blocked', async () => {
      const turner = await place(1, 0, 1, Direction.N);
      const mover = await place(2, 0, 0, Direction.N);
      await enqueue(turner, 'LEFT');
      await enqueue(mover, 'MOVE');
      await engine.step();
      expect(await stored(turner.id)).toEqual({
        x: 0,
        y: 1,
        direction: Direction.W,
      });
      expect(await stored(mover.id)).toMatchObject({ x: 0, y: 0 });
    });
  });
});
