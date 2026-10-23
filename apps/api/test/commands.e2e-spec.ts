import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { featureModules } from './../src/app.module.js';
import { sqliteTestDb } from './sqlite-test-db.js';

interface ApiLogEntry {
  action: string;
  params: string;
  result: string;
}

describe('Commands (e2e)', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());
  const log = async () =>
    (
      (await http().get('/log-entries?floorId=1').expect(200))
        .body as ApiLogEntry[]
    ).map((e) => [e.action, e.params, e.result]);

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [sqliteTestDb(':memory:'), ...featureModules],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('logs each command and tick in order', async () => {
    await http().post('/commands/floor').send({}).expect(200, { ok: true });
    await http()
      .post('/commands/place')
      .send({ x: 2, y: 3, direction: 'NORTH' })
      .expect(200, { ok: true });
    await http().post('/commands/obstacle').send({ x: 0, y: 0 }).expect(200);
    await http()
      .post('/commands/queue')
      .send({ rId: 'R1', commands: ['MOVE'] })
      .expect(200);
    await http().post('/engine/step').expect(200);
    await http().post('/commands/delete').send({ rId: 'R1' }).expect(200);
    await http().post('/engine/step').expect(200);
    expect(await log()).toEqual([
      ['FLOOR', '10, 8, CREATED', 'OK'],
      ['PLACE', 'R1 2, 3, NORTH', 'OK'],
      ['OBSTACLE', '0, 0, ON', 'OK'],
      ['QUEUE', 'R1 MOVE', 'OK'],
      ['TICK', '1', 'R1 2,4,NORTH'],
      ['DELETE', 'R1', 'OK'],
      ['TICK', '2', 'EMPTY'],
    ]);
  });

  it('an ignored command → 400 and no entry', async () => {
    await http().post('/commands/floor').send({}).expect(200);
    await http()
      .post('/commands/place')
      .send({ x: 0, y: 0, direction: 'NORTH' })
      .expect(200);
    const res = await http()
      .post('/commands/obstacle')
      .send({ x: 0, y: 0 })
      .expect(400);
    expect(res.body).toMatchObject({ message: 'Cell 0,0 has a robot' });
    expect(await log()).toHaveLength(2);
  });

  it('POST /commands/goto enqueues and logs; invalid body → 400', async () => {
    await http().post('/commands/floor').send({}).expect(200);
    await http()
      .post('/commands/place')
      .send({ x: 0, y: 0, direction: 'NORTH' })
      .expect(200);
    await http()
      .post('/commands/goto')
      .send({ rId: 'R1', x: 2, y: 2 })
      .expect(200, { ok: true });
    await http().post('/commands/goto').send({ rId: 'R1', y: 2 }).expect(400);
    await http()
      .post('/commands/goto')
      .send({ rId: 'r1', x: 2, y: 2 })
      .expect(400);
    expect((await log()).at(-1)).toEqual(['QUEUE', 'R1 GOTO 2,2', 'OK']);
    expect(await log()).toHaveLength(3);
  });

  it('an invalid rId → 400', async () => {
    await http().post('/commands/delete').send({ rId: 'r1' }).expect(400);
  });

  it('reset clears the log', async () => {
    await http().post('/commands/floor').send({}).expect(200);
    const floors = (await http().get('/floors').expect(200)).body as {
      id: number;
    }[];
    await http().post(`/floors/${floors[0].id}/reset`).expect(200);
    expect(await log()).toEqual([]);
  });
});
