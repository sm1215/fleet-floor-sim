import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { featureModules } from './../src/app.module.js';
import { sqliteTestDb } from './sqlite-test-db.js';

/**
 * Resource routes are read-only: every change goes through POST /commands/*
 * so it is logged (log-entry.md). Reset is the one other write.
 */
describe('Resource routes (e2e)', () => {
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

    await http().post('/commands/floor').send({ width: 2, height: 2 });
    await http()
      .post('/commands/place')
      .send({ x: 1, y: 0, direction: 'EAST' })
      .expect(200);
    await http()
      .post('/commands/queue')
      .send({ rId: 'R1', commands: ['MOVE'] })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  const first = async (path: string) =>
    ((await http().get(path).expect(200)).body as { id: number }[])[0];

  it.each([
    ['post', '/floors'],
    ['patch', '/floors/1'],
    ['delete', '/floors/1'],
    ['post', '/cells'],
    ['patch', '/cells/1'],
    ['delete', '/cells/1'],
    ['post', '/robots'],
    ['patch', '/robots/1'],
    ['delete', '/robots/1'],
    ['post', '/queued-commands'],
    ['patch', '/queued-commands/1'],
    ['delete', '/queued-commands/1'],
    ['post', '/log-entries'],
    ['patch', '/log-entries/1'],
    ['delete', '/log-entries/1'],
  ] as const)('%s %s is gone (404)', async (method, path) => {
    await http()[method](path).send({}).expect(404);
  });

  it('the removed routes changed nothing', async () => {
    const robots = await http().get('/robots').expect(200);
    expect(robots.body).toHaveLength(1);
    const log = await http().get('/log-entries').expect(200);
    expect((log.body as { action: string }[]).map((e) => e.action)).toEqual([
      'FLOOR',
      'PLACE',
      'QUEUE',
    ]);
  });

  it.each([
    '/floors/1',
    '/cells/1',
    '/robots/1',
    '/queued-commands',
    '/queued-commands/1',
    '/log-entries/1',
  ])('GET %s is gone (404)', async (path) => {
    await http().get(path).expect(404);
  });

  it('serves the reads the web uses, with their FK relations', async () => {
    const floor = await first('/floors');
    expect(floor).toMatchObject({ width: 2, height: 2 });

    const cell = await first('/cells');
    expect(cell).toMatchObject({ floor: { id: floor.id } });

    const robot = await first('/robots');
    expect(robot).toMatchObject({
      displayId: 1,
      cell: { xPosition: 1, yPosition: 0 },
    });
    const queue = await http()
      .get(`/robots/${robot.id}/queued-commands`)
      .expect(200);
    expect(queue.body).toMatchObject([
      { command: 'MOVE', robot: { id: robot.id } },
    ]);

    expect(await first('/log-entries')).toMatchObject({ action: 'FLOOR' });
  });

  it('GET /robots/:id/queued-commands: 400 for a non-integer id, [] for a missing robot', async () => {
    await http().get('/robots/abc/queued-commands').expect(400);
    await http().get('/robots/9999/queued-commands').expect(200, []);
  });

  it('POST /floors/:id/reset: 400 for a non-integer id, 404 for a missing floor', async () => {
    await http().post('/floors/abc/reset').expect(400);
    await http().post('/floors/9999/reset').expect(404);
  });
});
