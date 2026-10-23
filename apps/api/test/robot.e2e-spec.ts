import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { featureModules } from './../src/app.module.js';
import { sqliteTestDb } from './sqlite-test-db.js';

interface ApiRobot {
  id: number;
  displayId: number;
  direction: number;
  cell: { id: number; obstacle: boolean; xPosition: number; yPosition: number };
}

describe('Robots (e2e)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-'));
  let fileCount = 0;
  let file: string;
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());

  async function startApp(): Promise<INestApplication<App>> {
    const moduleRef = await Test.createTestingModule({
      imports: [sqliteTestDb(file), ...featureModules],
    }).compile();
    const started = moduleRef.createNestApplication<INestApplication<App>>();
    started.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await started.init();
    return started;
  }

  const robots = async () =>
    (await http().get('/robots').expect(200)).body as ApiRobot[];
  const place = (body: object) => http().post('/commands/place').send(body);

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

  it('PLACE on an Obstacle, occupied or missing cell → 400 and creates nothing', async () => {
    await http().post('/commands/floor').send({ width: 2, height: 1 });
    await http().post('/commands/obstacle').send({ x: 1, y: 0 }).expect(200);
    await place({ x: 0, y: 0, direction: 'NORTH' }).expect(200);
    const before = await robots();

    for (const [x, y] of [
      [1, 0],
      [0, 0],
      [5, 5],
    ]) {
      await place({ x, y, direction: 'NORTH' }).expect(400);
    }
    expect(await robots()).toEqual(before);
  });

  it("GET /robots/:id/queued-commands returns only that robot's commands, ascending Id", async () => {
    await http().post('/commands/floor').send({ width: 2, height: 1 });
    await place({ x: 0, y: 0, direction: 'NORTH' }).expect(200);
    await place({ x: 1, y: 0, direction: 'NORTH' }).expect(200);
    for (const [rId, command] of [
      ['R1', 'MOVE'],
      ['R2', 'LEFT'],
      ['R1', 'RIGHT'],
      ['R1', 'LEFT'],
    ]) {
      await http()
        .post('/commands/queue')
        .send({ rId, commands: [command] })
        .expect(200);
    }
    const first = (await robots()).find((r) => r.displayId === 1)!;

    const res = await http()
      .get(`/robots/${first.id}/queued-commands`)
      .expect(200);
    const rows = res.body as { id: number; command: string; params: null }[];
    expect(rows.map((r) => r.command)).toEqual(['MOVE', 'RIGHT', 'LEFT']);
    expect(rows.map((r) => r.id)).toEqual(
      rows.map((r) => r.id).sort((x, y) => x - y),
    );
    expect(rows.every((r) => r.params === null)).toBe(true);
  });

  it('DELETE removes a robot that has queued commands, and its commands', async () => {
    await http().post('/commands/floor').send({ width: 1, height: 1 });
    await place({ x: 0, y: 0, direction: 'NORTH' }).expect(200);
    await http()
      .post('/commands/queue')
      .send({ rId: 'R1', commands: ['MOVE'] })
      .expect(200);
    const [robot] = await robots();

    await http().post('/commands/delete').send({ rId: 'R1' }).expect(200);

    expect(await robots()).toEqual([]);
    const commands = await http()
      .get(`/robots/${robot.id}/queued-commands`)
      .expect(200);
    expect(commands.body).toEqual([]);
  });

  it('a placed robot is returned by GET /robots with its cell and direction after an app restart', async () => {
    await http().post('/commands/floor').send({ width: 3, height: 3 });
    await place({ x: 2, y: 1, direction: 'EAST' }).expect(200);
    const [placed] = await robots();
    await app.close();

    app = await startApp();
    expect(await robots()).toEqual([
      {
        id: placed.id,
        displayId: 1,
        direction: 1,
        cell: {
          id: placed.cell.id,
          obstacle: false,
          xPosition: 2,
          yPosition: 1,
        },
      },
    ]);
  });
});
