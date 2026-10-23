import { DataSource } from 'typeorm';
import {
  Cell,
  entities,
  Floor,
  LogEntry,
  Robot,
  TickHistory,
} from '../database/entities/index.js';
import { migrations } from './sqlite-test-db.js';

describe('Timeline schema (e2e)', () => {
  let db: DataSource;

  beforeEach(async () => {
    db = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities,
      migrations,
      synchronize: false,
    });
    await db.initialize();
    await db.runMigrations();
  });

  afterEach(async () => {
    await db.destroy();
  });

  async function floorWithCell(): Promise<{ floor: Floor; cell: Cell }> {
    const floor = await db.getRepository(Floor).save({ width: 1, height: 1 });
    const cell = await db.getRepository(Cell).save({
      obstacle: false,
      xPosition: 0,
      yPosition: 0,
      floor,
    });
    return { floor, cell };
  }

  it('two robots on different floors may share a displayId', async () => {
    const a = await floorWithCell();
    const b = await floorWithCell();
    const robots = db.getRepository(Robot);
    await robots.save({ displayId: 1, direction: 0, cell: a.cell });
    await robots.save({ displayId: 1, direction: 0, cell: b.cell });
    expect(await robots.count()).toBe(2);
  });

  it('tick_history rejects a duplicate (floor, tick)', async () => {
    const { floor } = await floorWithCell();
    const repo = db.getRepository(TickHistory);
    await repo.insert({ floor, tick: 0, state: '{}' });
    await expect(repo.insert({ floor, tick: 0, state: '{}' })).rejects.toThrow(
      /SQLITE_CONSTRAINT|UNIQUE/,
    );
  });

  it('log_entry.floor_id references floor', async () => {
    await expect(
      db.getRepository(LogEntry).insert({
        action: 'TICK',
        params: '1',
        result: 'EMPTY',
        tick: 1,
        floor: { id: 999 },
      }),
    ).rejects.toMatchObject({
      driverError: { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' },
    });
  });

  it('migration backfills log_entry.tick', async () => {
    await db.undoLastMigration();
    await db.query(`INSERT INTO "floor" ("height", "width") VALUES (5, 5)`);
    for (const [action, params] of [
      ['FLOOR', '5, 5, CREATED'],
      ['TICK', '1'],
      ['PLACE', 'R1 0, 0, NORTH'],
      ['TICK', '2'],
    ]) {
      await db.query(
        `INSERT INTO "log_entry" ("action", "params", "result") VALUES (?, ?, 'OK')`,
        [action, params],
      );
    }
    await db.runMigrations();
    const rows = await db
      .getRepository(LogEntry)
      .find({ order: { id: 'ASC' }, relations: { floor: true } });
    expect(rows.map((r) => r.tick)).toEqual([0, 1, 1, 2]);
    expect(rows.every((r) => r.floor.id === 1)).toBe(true);
  });
});
