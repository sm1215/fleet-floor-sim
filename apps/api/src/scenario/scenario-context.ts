import {
  type DynamicModule,
  type INestApplicationContext,
  Module,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { entities } from '../../database/entities/index.js';
import { EngineModule } from '../engine/engine.module.js';

@Module({})
class ScenarioModule {}

/** A fresh in-memory DB per run; the real DB is never touched. */
export function scenarioDbOptions(
  migrations: TypeOrmModuleOptions['migrations'],
): TypeOrmModuleOptions {
  return {
    type: 'better-sqlite3',
    database: ':memory:',
    entities,
    migrations,
    migrationsRun: true,
    synchronize: false,
  };
}

/** DI only, no HTTP. The logger is off so stdout carries REPORT output only. */
export function createScenarioContext(
  db: DynamicModule,
): Promise<INestApplicationContext> {
  return NestFactory.createApplicationContext(
    { module: ScenarioModule, imports: [db, EngineModule] },
    { logger: false },
  );
}
