import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { featureModules } from './../src/app.module.js';
import { sqliteTestDb } from './sqlite-test-db.js';

interface ApiCell {
  id: number;
  obstacle: boolean;
  xPosition: number;
  yPosition: number;
  floor: { id: number };
}

describe('Robots (e2e)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-'));
  const file = join(dir, 'test.sqlite');
  let app: INestApplication<App>;
  let http: () => ReturnType<typeof request>;

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

  /** Creates a floor and returns its cells. */
  async function floorCells(width: number, height: number) {
    const floor = await http()
      .post('/floors')
      .send({ width, height })
      .expect(201);
    const floorId = (floor.body as { id: number }).id;
    const cells = await http().get('/cells').expect(200);
    return (cells.body as ApiCell[]).filter((c) => c.floor.id === floorId);
  }

  beforeAll(async () => {
    app = await startApp();
    http = () => request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns 400 for an Obstacle, occupied or missing cell and creates nothing', async () => {
    const [open, obstacle] = await floorCells(2, 1);
    await http()
      .patch(`/cells/${obstacle.id}`)
      .send({ obstacle: true })
      .expect(200);
    await http()
      .post('/robots')
      .send({ direction: 0, cellId: open.id })
      .expect(201);
    const before = await http().get('/robots').expect(200);

    for (const cellId of [obstacle.id, open.id, 99999]) {
      await http().post('/robots').send({ direction: 0, cellId }).expect(400);
    }
    const after = await http().get('/robots').expect(200);
    expect(after.body).toEqual(before.body);
  });

  it('returns 400 for a non-integer displayId and creates nothing', async () => {
    const cells = await floorCells(2, 1);
    const before = await http().get('/robots').expect(200);
    await http()
      .post('/robots')
      .send({ direction: 0, cellId: cells[0].id, displayId: 'x' })
      .expect(400);
    const after = await http().get('/robots').expect(200);
    expect(after.body).toEqual(before.body);
  });

  it('rejects obstacle: true on a cell with a robot; the cell is unchanged', async () => {
    const [cell] = await floorCells(1, 1);
    await http()
      .post('/robots')
      .send({ direction: 0, cellId: cell.id })
      .expect(201);
    await http()
      .patch(`/cells/${cell.id}`)
      .send({ obstacle: true })
      .expect(400);
    const res = await http().get(`/cells/${cell.id}`).expect(200);
    expect(res.body).toMatchObject({ obstacle: false });
  });

  it("GET /robots/:id/queued-commands returns only that robot's commands, ascending Id", async () => {
    const [a, b] = await floorCells(2, 1);
    const robotIds: number[] = [];
    for (const cell of [a, b]) {
      const robot = await http()
        .post('/robots')
        .send({ direction: 0, cellId: cell.id })
        .expect(201);
      robotIds.push((robot.body as { id: number }).id);
    }
    const [first, second] = robotIds;
    for (const [robotId, command] of [
      [first, 'MOVE'],
      [second, 'LEFT'],
      [first, 'RIGHT'],
      [first, 'LEFT'],
    ] as const) {
      await http()
        .post('/queued-commands')
        .send({ robotId, command })
        .expect(201);
    }

    const res = await http()
      .get(`/robots/${first}/queued-commands`)
      .expect(200);
    const rows = res.body as { id: number; command: string; params: null }[];
    expect(rows.map((r) => r.command)).toEqual(['MOVE', 'RIGHT', 'LEFT']);
    expect(rows.map((r) => r.id)).toEqual(
      rows.map((r) => r.id).sort((x, y) => x - y),
    );
    expect(rows.every((r) => r.params === null)).toBe(true);
  });

  it('DELETE /robots/:id removes a robot that has queued commands, and its commands', async () => {
    const [cell] = await floorCells(1, 1);
    const robot = await http()
      .post('/robots')
      .send({ direction: 0, cellId: cell.id })
      .expect(201);
    const id = (robot.body as { id: number }).id;
    await http()
      .post('/queued-commands')
      .send({ robotId: id, command: 'MOVE' })
      .expect(201);

    await http().delete(`/robots/${id}`).expect(200);

    const robots = await http().get('/robots').expect(200);
    expect((robots.body as { id: number }[]).map((r) => r.id)).not.toContain(
      id,
    );
    const commands = await http()
      .get(`/robots/${id}/queued-commands`)
      .expect(200);
    expect(commands.body).toEqual([]);
  });

  it('a created robot is returned by GET /robots with its cell and direction after an app restart', async () => {
    const cells = await floorCells(3, 3);
    const cell = cells.find((c) => c.xPosition === 2 && c.yPosition === 1)!;
    const created = await http()
      .post('/robots')
      .send({ direction: 1, cellId: cell.id })
      .expect(201);
    const id = (created.body as { id: number }).id;
    await app.close();

    app = await startApp();
    const robots = await http().get('/robots').expect(200);
    expect(robots.body).toContainEqual({
      id,
      displayId: id,
      direction: 1,
      cell: {
        id: cell.id,
        obstacle: false,
        xPosition: 2,
        yPosition: 1,
      },
    });
  });
});
