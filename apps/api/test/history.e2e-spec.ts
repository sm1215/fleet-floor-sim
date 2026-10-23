import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { TickHistory } from '../database/entities/index.js';
import { featureModules } from './../src/app.module.js';
import { sqliteTestDb } from './sqlite-test-db.js';

interface ApiFloorState {
  width: number;
  height: number;
  robots: { displayId: number; x: number; y: number; queue: string[] }[];
}

describe('Floor history (e2e)', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [sqliteTestDb(':memory:'), ...featureModules],
    }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    // Floor 1; R1 moves north one cell per tick for 5 ticks.
    await http().post('/commands/floor').send({}).expect(200);
    await http()
      .post('/commands/place')
      .send({ x: 0, y: 0, direction: 'NORTH' })
      .expect(200);
    await http()
      .post('/commands/queue')
      .send({ rId: 'R1', commands: ['MOVE', 'MOVE', 'MOVE', 'MOVE'] })
      .expect(200);
    for (let i = 0; i < 5; i++) await http().post('/engine/step').expect(200);
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /floors/:id/history?tick=3 returns that tick's robots", async () => {
    const res = await http().get('/floors/1/history?tick=3').expect(200);
    const state = res.body as ApiFloorState;
    expect(state).toMatchObject({ width: 5, height: 5 });
    expect(state.robots).toMatchObject([
      { displayId: 1, x: 0, y: 3, queue: ['MOVE'] },
    ]);
  });

  it('tick above currentTick, negative or non-int → 400', async () => {
    for (const tick of ['6', '-1', '1.5', 'x', '']) {
      const res = await http()
        .get(`/floors/1/history?tick=${tick}`)
        .expect(400);
      expect(res.body).toMatchObject({
        message: 'Tick must be an int from 0 to 5',
      });
    }
  });

  it('unknown floor → 400 Floor <id> not found', async () => {
    const res = await http().get('/floors/9/history?tick=0').expect(400);
    expect(res.body).toMatchObject({ message: 'Floor 9 not found' });
  });

  it('a tick with no snapshot at or before it (pre-timeline data) → 400 No history', async () => {
    await app.get(DataSource).getRepository(TickHistory).clear();
    const res = await http().get('/floors/1/history?tick=2').expect(400);
    expect(res.body).toMatchObject({ message: 'No history for tick 2' });
    await http().get('/floors/1/history?tick=5').expect(200);
  });

  it('POST /floors/:id/fork { tick } → 200 { floorId }; GET /engine shows that floorId and currentTick = tick', async () => {
    const res = await http()
      .post('/floors/1/fork')
      .send({ tick: 3 })
      .expect(200);
    const { floorId } = res.body as { floorId: number };
    expect(floorId).not.toBe(1);
    expect((await http().get('/engine').expect(200)).body).toMatchObject({
      floorId,
      currentTick: 3,
      running: false,
    });
    const robots = (await http().get(`/robots?floorId=${floorId}`).expect(200))
      .body as { cell: { yPosition: number } }[];
    expect(robots.map((r) => r.cell.yPosition)).toEqual([3]);
  });

  it('fork: tick > currentTick → 400; a missing or negative tick → 400', async () => {
    const res = await http()
      .post('/floors/1/fork')
      .send({ tick: 6 })
      .expect(400);
    expect(res.body).toMatchObject({
      message: 'Tick must be an int from 0 to 5',
    });
    await http().post('/floors/1/fork').send({}).expect(400);
    await http().post('/floors/1/fork').send({ tick: -1 }).expect(400);
  });
});
