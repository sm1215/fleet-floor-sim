import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { featureModules } from './../src/app.module.js';
import { sqliteTestDb } from './sqlite-test-db.js';

describe('Floor persistence (e2e)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-'));
  let fileCount = 0;

  /** Each test gets its own DB file; pass the same file to restart. */
  const newFile = () => join(dir, `test-${++fileCount}.sqlite`);

  async function startApp(file: string): Promise<INestApplication<App>> {
    const moduleRef = await Test.createTestingModule({
      imports: [sqliteTestDb(file), ...featureModules],
    }).compile();
    const app = moduleRef.createNestApplication<INestApplication<App>>();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    return app;
  }

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('a FLOOR resize is returned by GET /floors after an app restart', async () => {
    const file = newFile();
    const first = await startApp(file);
    await request(first.getHttpServer())
      .post('/commands/floor')
      .send({})
      .expect(200);
    await request(first.getHttpServer())
      .post('/commands/floor')
      .send({ width: 7, height: 3 })
      .expect(200);
    await first.close();

    const second = await startApp(file);
    try {
      const floors = await request(second.getHttpServer())
        .get('/floors')
        .expect(200);
      expect(floors.body).toMatchObject([{ width: 7, height: 3 }]);
      const cells = await request(second.getHttpServer())
        .get('/cells')
        .expect(200);
      expect(cells.body).toHaveLength(21);
    } finally {
      await second.close();
    }
  });

  it('POST /floors/:id/reset → 200, then GET /floors shows it 10×8', async () => {
    const app = await startApp(newFile());
    try {
      const server = app.getHttpServer();
      await request(server)
        .post('/commands/floor')
        .send({ width: 8, height: 6 })
        .expect(200);
      const floors = await request(server).get('/floors').expect(200);
      const id = (floors.body as { id: number }[])[0].id;
      await request(server)
        .post(`/floors/${id}/reset`)
        .expect(200)
        .expect({ id, width: 10, height: 8 });
      await request(server)
        .get('/floors')
        .expect(200)
        .expect([{ id, width: 10, height: 8 }]);
    } finally {
      await app.close();
    }
  });

  it('POST /floors/:id/delete → 200; GET /floors no longer lists it; unknown → 404', async () => {
    const app = await startApp(newFile());
    try {
      const server = app.getHttpServer();
      await request(server).post('/commands/floor').send({}).expect(200);
      const res = await request(server)
        .post('/floors/1/fork')
        .send({ tick: 0 });
      const forked = (res.body as { floorId: number }).floorId;
      const state = await request(server)
        .post(`/floors/${forked}/delete`)
        .expect(200);
      expect(state.body).toMatchObject({ floorId: 1, currentTick: 0 });
      const floors = await request(server).get('/floors').expect(200);
      expect((floors.body as { id: number }[]).map((f) => f.id)).toEqual([1]);
      const missing = await request(server)
        .post('/floors/9999/delete')
        .expect(404);
      expect(missing.body).toMatchObject({ message: 'Floor 9999 not found' });
    } finally {
      await app.close();
    }
  });
});
