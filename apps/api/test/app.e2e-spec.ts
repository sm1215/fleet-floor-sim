import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { entities } from '../database/entities/index.js';
import { AppModule } from './../src/app.module.js';
import { migrations } from './sqlite-test-db.js';

describe('AppController (e2e)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-app-'));
  let app: INestApplication<App>;

  beforeEach(async () => {
    // The Engine reads the DB on start, so AppModule needs a migrated file.
    const database = join(dir, 'app.sqlite');
    const db = new DataSource({
      type: 'better-sqlite3',
      database,
      entities,
      migrations,
    });
    await db.initialize();
    await db.runMigrations();
    await db.destroy();
    process.env.DB_PATH = database;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
});
