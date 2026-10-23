import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { Floor, LogEntry } from '../database/entities/index.js';
import { featureModules } from './../src/app.module.js';
import { sqliteTestDb } from './sqlite-test-db.js';

interface ApiLogEntry {
  action: string;
  params: string;
  tick: number;
}

describe('Engine (e2e)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-engine-'));
  let fileCount = 0;
  let file: string;
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());

  async function startApp(): Promise<INestApplication<App>> {
    const moduleFixture = await Test.createTestingModule({
      // Step reads the queue, so the DB needs the migrated schema.
      imports: [sqliteTestDb(file), ...featureModules],
    }).compile();
    const started =
      moduleFixture.createNestApplication<INestApplication<App>>();
    await started.init();
    return started;
  }

  // A fresh DB file per test; the restart test reopens the same file.
  beforeEach(async () => {
    file = join(dir, `test-${++fileCount}.sqlite`);
    app = await startApp();
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('GET /engine returns the initial state', () => {
    return http().get('/engine').expect(200).expect({
      floorId: null,
      currentTick: 0,
      tickRate: 1000,
      running: false,
      errors: [],
    });
  });

  it('POST /engine/step advances one tick', async () => {
    await http().post('/commands/floor').send({}).expect(200);
    await http().post('/engine/step').expect(200);
    const res = await http().post('/engine/step').expect(200);
    expect(res.body).toMatchObject({ floorId: 1, currentTick: 2 });
  });

  it('POST /engine/step while running returns 400 with a message', async () => {
    await http().post('/engine/toggle').expect(200);
    const res = await http().post('/engine/step').expect(400);
    expect(res.body).toMatchObject({
      message: 'Cannot step while the simulation is running. Pause it first.',
    });
  });

  it('POST /engine/toggle turns running on and off', async () => {
    const on = await http().post('/engine/toggle').expect(200);
    expect(on.body).toMatchObject({ running: true });
    const off = await http().post('/engine/toggle').expect(200);
    expect(off.body).toMatchObject({ running: false });
  });

  it('after an app restart the next step logs TICK n+1 and GET /engine returns n+1', async () => {
    await http().post('/commands/floor').send({}).expect(200);
    await http().post('/engine/step').expect(200);
    await http().post('/engine/step').expect(200);
    await app.close();

    app = await startApp();
    expect((await http().get('/engine').expect(200)).body).toMatchObject({
      floorId: 1,
      currentTick: 2,
    });
    await http().post('/engine/step').expect(200);
    expect((await http().get('/engine').expect(200)).body).toMatchObject({
      currentTick: 3,
    });
    const log = (await http().get('/log-entries?floorId=1').expect(200))
      .body as ApiLogEntry[];
    expect(log.map((e) => [e.action, e.params, e.tick])).toEqual([
      ['FLOOR', '5, 5, CREATED', 0],
      ['TICK', '1', 1],
      ['TICK', '2', 2],
      ['TICK', '3', 3],
    ]);
  });

  it("GET /log-entries?floorId= returns only that floor's entries", async () => {
    await http().post('/commands/floor').send({}).expect(200);
    const db = app.get(DataSource);
    const other = await db.getRepository(Floor).save({ width: 1, height: 1 });
    await db.getRepository(LogEntry).save({
      action: 'FLOOR',
      params: '1, 1, CREATED',
      result: 'OK',
      tick: 0,
      floor: other,
    });
    const mine = (await http().get('/log-entries?floorId=1').expect(200))
      .body as ApiLogEntry[];
    expect(mine.map((e) => e.params)).toEqual(['5, 5, CREATED']);
    const theirs = (
      await http().get(`/log-entries?floorId=${other.id}`).expect(200)
    ).body as ApiLogEntry[];
    expect(theirs.map((e) => e.params)).toEqual(['1, 1, CREATED']);
    await http().get('/log-entries').expect(400);
  });

  it('POST /engine/floor selects a floor; unknown → 400', async () => {
    await http().post('/commands/floor').send({}).expect(200);
    const other = await app
      .get(DataSource)
      .getRepository(Floor)
      .save({ width: 1, height: 1 });
    const res = await http()
      .post('/engine/floor')
      .send({ floorId: other.id })
      .expect(200);
    expect(res.body).toMatchObject({ floorId: other.id, currentTick: 0 });
    const bad = await http()
      .post('/engine/floor')
      .send({ floorId: 999 })
      .expect(400);
    expect(bad.body).toMatchObject({ message: 'Floor 999 not found' });
  });
});
