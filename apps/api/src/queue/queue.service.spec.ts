import { Test } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import {
  Cell,
  Floor,
  QueuedCommand,
  Robot,
} from '../../database/entities/index.js';
import { sqliteTestDb } from '../../test/sqlite-test-db.js';
import { QueueModule } from './queue.module.js';
import { QueueService } from './queue.service.js';

describe('QueueService.doNext()', () => {
  let dataSource: DataSource;
  let service: QueueService;
  let robots: Repository<Robot>;
  let commands: Repository<QueuedCommand>;
  let cellIds: number[];
  let floorId: number;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [sqliteTestDb(':memory:'), QueueModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    service = moduleRef.get(QueueService);
    robots = dataSource.getRepository(Robot);
    commands = dataSource.getRepository(QueuedCommand);
    const floor = await dataSource
      .getRepository(Floor)
      .save({ width: 3, height: 1 });
    floorId = floor.id;
    const cells = await dataSource.getRepository(Cell).save(
      [0, 1, 2].map((x) => ({
        obstacle: false,
        xPosition: x,
        yPosition: 0,
        floor,
      })),
    );
    cellIds = cells.map((c) => c.id);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  /** Robots are saved in the order given, so ids ascend in that order. */
  async function addRobot(displayId: number, ...queue: string[]) {
    const robot = await robots.save({
      direction: 0,
      displayId,
      cell: { id: cellIds[(await robots.count()) % cellIds.length] },
    });
    for (const command of queue) {
      await commands.save({ command, params: null, robot: { id: robot.id } });
    }
    return robot;
  }

  async function run() {
    return Promise.all(await service.doNext(floorId));
  }

  async function queueOf(robotId: number): Promise<string[]> {
    const rows = await commands.find({
      where: { robot: { id: robotId } },
      order: { id: 'ASC' },
    });
    return rows.map((r) => r.command);
  }

  it('returns a promise of an array with one promise per robot', async () => {
    await addRobot(1, 'MOVE');
    await addRobot(2);
    const outer = service.doNext(floorId);
    expect(outer).toBeInstanceOf(Promise);
    const inner = await outer;
    expect(inner).toHaveLength(2);
    expect(inner[0]).toBeInstanceOf(Promise);
    await Promise.all(inner);
  });

  it('no robots → []', async () => {
    await expect(service.doNext(floorId)).resolves.toEqual([]);
  });

  it('results are in displayId order, even when it differs from id order', async () => {
    await addRobot(5, 'MOVE');
    await addRobot(2, 'MOVE');
    const results = await run();
    expect(results.map((r) => r?.robot.displayId)).toEqual([2, 5]);
  });

  it('only the oldest command is returned; the rest stay queued', async () => {
    const robot = await addRobot(1, 'LEFT', 'MOVE');
    const [result] = await run();
    expect(result?.command).toBe('LEFT');
    await expect(queueOf(robot.id)).resolves.toEqual(['MOVE']);
  });

  it('LEFT / RIGHT / MOVE are parsed and returned with their robot', async () => {
    const left = await addRobot(1, 'LEFT');
    const right = await addRobot(2, 'RIGHT');
    const move = await addRobot(3, 'MOVE');
    const results = await run();
    expect(results.map((r) => [r?.robot.id, r?.command])).toEqual([
      [left.id, 'LEFT'],
      [right.id, 'RIGHT'],
      [move.id, 'MOVE'],
    ]);
  });

  it('returns the robot with its cell', async () => {
    await addRobot(1, 'MOVE');
    const [result] = await run();
    expect(result?.robot.cell).toMatchObject({ xPosition: 0, yPosition: 0 });
  });

  it('a robot with an empty queue resolves to null', async () => {
    await addRobot(1);
    await expect(run()).resolves.toEqual([null]);
  });

  it('a command that fails to parse resolves to null and is deleted', async () => {
    await addRobot(1, 'JUMP');
    await addRobot(2, 'move');
    await addRobot(3, ' MOVE');
    await expect(run()).resolves.toEqual([null, null, null]);
    await expect(commands.count()).resolves.toBe(0);
  });

  it('every command taken is deleted, one per robot', async () => {
    const all = [
      await addRobot(1, 'LEFT', 'RIGHT'),
      await addRobot(2, 'MOVE', 'LEFT'),
      await addRobot(3, 'RIGHT', 'MOVE'),
    ];
    await run();
    await expect(commands.count()).resolves.toBe(3);
    for (const robot of all) {
      await expect(queueOf(robot.id)).resolves.toHaveLength(1);
    }
  });
  it("doNext(floorId) takes heads only from that floor's robots", async () => {
    const mine = await addRobot(1, 'MOVE');
    const other = await dataSource
      .getRepository(Floor)
      .save({ width: 1, height: 1 });
    const otherCell = await dataSource.getRepository(Cell).save({
      obstacle: false,
      xPosition: 0,
      yPosition: 0,
      floor: other,
    });
    const theirs = await robots.save({
      direction: 0,
      displayId: 1,
      cell: { id: otherCell.id },
    });
    await commands.save({ command: 'LEFT', params: null, robot: theirs });
    const taken = await run();
    expect(taken.map((t) => t && [t.robot.id, t.command])).toEqual([
      [mine.id, 'MOVE'],
    ]);
    expect(await queueOf(theirs.id)).toEqual(['LEFT']);
  });
  describe('GOTO', () => {
    async function addGoto(robotId: number, params: string | null) {
      return commands.save({ command: 'GOTO', params, robot: { id: robotId } });
    }

    it('a GOTO head resolves with its target and is not deleted', async () => {
      const robot = await addRobot(1);
      const goto = await addGoto(robot.id, '3,4');
      const expected = {
        robot: expect.objectContaining({ id: robot.id }) as unknown,
        command: 'GOTO',
        queuedCommandId: goto.id,
        target: { x: 3, y: 4 },
      };
      await expect(run()).resolves.toEqual([expected]);
      expect(await commands.existsBy({ id: goto.id })).toBe(true);
      await expect(run()).resolves.toEqual([expected]);
    });

    it('commands queued behind a GOTO are not returned', async () => {
      const robot = await addRobot(1);
      await addGoto(robot.id, '1,0');
      await commands.save({ command: 'MOVE', params: null, robot });
      const [result] = await run();
      expect(result?.command).toBe('GOTO');
      await expect(queueOf(robot.id)).resolves.toEqual(['GOTO', 'MOVE']);
    });

    it.each([null, '3', 'a,b'])(
      'a GOTO with params %s resolves to null and is deleted',
      async (params) => {
        const robot = await addRobot(1);
        await addGoto(robot.id, params);
        await expect(run()).resolves.toEqual([null]);
        await expect(commands.count()).resolves.toBe(0);
      },
    );

    it('remove(id, manager) deletes that row only', async () => {
      const robot = await addRobot(1);
      const goto = await addGoto(robot.id, '1,0');
      await commands.save({ command: 'MOVE', params: null, robot });
      await service.remove(goto.id, dataSource.manager);
      await expect(queueOf(robot.id)).resolves.toEqual(['MOVE']);
    });
  });
});
