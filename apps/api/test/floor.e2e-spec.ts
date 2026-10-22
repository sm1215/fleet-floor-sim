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
  const file = join(dir, 'test.sqlite');

  async function startApp(): Promise<INestApplication<App>> {
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

  it('PATCHed width/height are returned by GET /floors after an app restart', async () => {
    const first = await startApp();
    const created = await request(first.getHttpServer())
      .post('/floors')
      .send({ width: 5, height: 5 })
      .expect(201);
    const id = (created.body as { id: number }).id;
    await request(first.getHttpServer())
      .patch(`/floors/${id}`)
      .send({ width: 7, height: 3 })
      .expect(200);
    await first.close();

    const second = await startApp();
    try {
      const floors = await request(second.getHttpServer())
        .get('/floors')
        .expect(200);
      expect(floors.body).toContainEqual({ id, width: 7, height: 3 });
      const cells = await request(second.getHttpServer())
        .get('/cells')
        .expect(200);
      expect(
        (cells.body as { floor: { id: number } }[]).filter(
          (c) => c.floor.id === id,
        ),
      ).toHaveLength(21);
    } finally {
      await second.close();
    }
  });

  it('POST /floors/:id/reset → 200, then GET /floors/:id is 5×5', async () => {
    const app = await startApp();
    try {
      const server = app.getHttpServer();
      const created = await request(server)
        .post('/floors')
        .send({ width: 8, height: 6 })
        .expect(201);
      const id = (created.body as { id: number }).id;
      await request(server)
        .post(`/floors/${id}/reset`)
        .expect(200)
        .expect({ id, width: 5, height: 5 });
      await request(server)
        .get(`/floors/${id}`)
        .expect(200)
        .expect({ id, width: 5, height: 5 });
    } finally {
      await app.close();
    }
  });
});
