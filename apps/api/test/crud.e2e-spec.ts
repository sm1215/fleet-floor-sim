import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { featureModules } from './../src/app.module.js';
import { sqliteTestDb } from './sqlite-test-db.js';

describe('CRUD (e2e)', () => {
  let app: INestApplication<App>;
  let http: () => ReturnType<typeof request>;

  beforeAll(async () => {
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
    http = () => request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  async function roundTrip(
    path: string,
    body: Record<string, unknown>,
    patch: Record<string, unknown>,
  ): Promise<number> {
    const created = await http().post(path).send(body).expect(201);
    const id = (created.body as { id: number }).id;
    expect(typeof id).toBe('number');

    const list = await http().get(path).expect(200);
    expect((list.body as { id: number }[]).map((r) => r.id)).toContain(id);

    await http().get(`${path}/${id}`).expect(200);

    const patched = await http().patch(`${path}/${id}`).send(patch).expect(200);
    expect(patched.body).toMatchObject(patch);
    return id;
  }

  async function removeAndExpect404(path: string, id: number) {
    await http().delete(`${path}/${id}`).expect(200);
    await http().get(`${path}/${id}`).expect(404);
  }

  it('round-trips every resource', async () => {
    const floorId = await roundTrip(
      '/floors',
      { height: 5, width: 5 },
      {
        width: 6,
      },
    );
    const cellId = await roundTrip(
      '/cells',
      { obstacle: false, xPosition: 19, yPosition: 19, floorId },
      { obstacle: true },
    );
    const robotId = await roundTrip(
      '/robots',
      { direction: 0, cellId },
      { direction: 1 },
    );
    const commandId = await roundTrip(
      '/queued-commands',
      { command: 'MOVE', params: '', robotId },
      { command: 'TURN_RIGHT' },
    );
    const logId = await roundTrip(
      '/log-entries',
      { action: 'place', params: '0,0', result: 'ok' },
      { result: 'blocked' },
    );

    // Delete children before parents: FKs are enforced.
    await removeAndExpect404('/queued-commands', commandId);
    await removeAndExpect404('/robots', robotId);
    await removeAndExpect404('/cells', cellId);
    await removeAndExpect404('/floors', floorId);
    await removeAndExpect404('/log-entries', logId);
  });

  it('exposes the FK relation on reads', async () => {
    const floor = await http().post('/floors').send({ height: 2, width: 2 });
    const floorId = (floor.body as { id: number }).id;
    const cell = await http()
      .post('/cells')
      .send({ obstacle: false, xPosition: 19, yPosition: 19, floorId })
      .expect(201);
    const res = await http()
      .get(`/cells/${(cell.body as { id: number }).id}`)
      .expect(200);
    expect(res.body).toMatchObject({ floor: { id: floorId } });
  });

  it('rejects invalid and unknown fields', async () => {
    await http().post('/floors').send({ height: 0, width: 5 }).expect(400);
    await http().post('/floors').send({ height: 5, width: 21 }).expect(400);
    await http()
      .post('/floors')
      .send({ height: 5, width: 5, extra: 1 })
      .expect(400);
    await http()
      .post('/queued-commands')
      .send({ command: 'JUMP', params: '', robotId: 1 })
      .expect(400);
    await http().post('/robots').send({ direction: 4, cellId: 1 }).expect(400);
  });

  it('rejects null in PATCH bodies', async () => {
    const floor = await http().post('/floors').send({ height: 3, width: 3 });
    const floorId = (floor.body as { id: number }).id;
    const cell = await http()
      .post('/cells')
      .send({ obstacle: false, xPosition: 19, yPosition: 19, floorId });
    const cellId = (cell.body as { id: number }).id;
    const robot = await http().post('/robots').send({ direction: 0, cellId });
    const robotId = (robot.body as { id: number }).id;
    const command = await http()
      .post('/queued-commands')
      .send({ command: 'MOVE', params: '', robotId });
    const commandId = (command.body as { id: number }).id;
    const log = await http()
      .post('/log-entries')
      .send({ action: 'a', params: 'p', result: 'r' });
    const logId = (log.body as { id: number }).id;

    const cases: [string, Record<string, null>][] = [
      [`/floors/${floorId}`, { width: null }],
      [`/floors/${floorId}`, { height: null }],
      [`/cells/${cellId}`, { floorId: null }],
      [`/cells/${cellId}`, { obstacle: null }],
      [`/cells/${cellId}`, { xPosition: null }],
      [`/cells/${cellId}`, { yPosition: null }],
      [`/robots/${robotId}`, { cellId: null }],
      [`/robots/${robotId}`, { direction: null }],
      [`/queued-commands/${commandId}`, { robotId: null }],
      [`/queued-commands/${commandId}`, { command: null }],
      [`/queued-commands/${commandId}`, { params: null }],
      [`/log-entries/${logId}`, { action: null }],
      [`/log-entries/${logId}`, { params: null }],
      [`/log-entries/${logId}`, { result: null }],
    ];
    for (const [path, body] of cases) {
      const res = await http().patch(path).send(body);
      expect({ path, body, status: res.status }).toEqual({
        path,
        body,
        status: 400,
      });
    }
    const cellRes = await http().get(`/cells/${cellId}`).expect(200);
    expect(cellRes.body).toMatchObject({ floor: { id: floorId } });
  });

  it('returns 400 for a non-integer id and 404 for a missing one', async () => {
    await http().get('/floors/abc').expect(400);
    await http().get('/floors/9999').expect(404);
    await http().patch('/floors/9999').send({ width: 3 }).expect(404);
    await http().delete('/floors/9999').expect(404);
  });
});
