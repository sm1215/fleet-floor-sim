import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

describe('Engine (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /engine returns the initial state', () => {
    return request(app.getHttpServer())
      .get('/engine')
      .expect(200)
      .expect({ currentTick: 0, tickRate: 1000, running: false, errors: [] });
  });

  it('POST /engine/step advances one tick', async () => {
    await request(app.getHttpServer()).post('/engine/step').expect(200);
    const res = await request(app.getHttpServer())
      .post('/engine/step')
      .expect(200);
    expect(res.body).toMatchObject({ currentTick: 2 });
  });

  it('POST /engine/step while running returns 400 with a message', async () => {
    await request(app.getHttpServer()).post('/engine/toggle').expect(200);
    const res = await request(app.getHttpServer())
      .post('/engine/step')
      .expect(400);
    expect(res.body).toMatchObject({
      message: 'Cannot step while the simulation is running. Pause it first.',
    });
  });

  it('POST /engine/toggle turns running on and off', async () => {
    const on = await request(app.getHttpServer())
      .post('/engine/toggle')
      .expect(200);
    expect(on.body).toMatchObject({ running: true });
    const off = await request(app.getHttpServer())
      .post('/engine/toggle')
      .expect(200);
    expect(off.body).toMatchObject({ running: false });
  });
});
