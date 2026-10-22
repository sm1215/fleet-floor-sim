/// <reference types="vite/client" />
import type { DynamicModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { entities } from '../database/entities/index.js';

// Load migrations through Vite: TypeORM's own glob loader imports the .ts
// files natively, which fails on their type-only imports.
const migrations = Object.values(
  import.meta.glob<Record<string, new () => unknown>>(
    '../database/migrations/*.ts',
    { eager: true },
  ),
).flatMap((mod) => Object.values(mod));

export function sqliteTestDb(database: string): DynamicModule {
  return TypeOrmModule.forRoot({
    type: 'better-sqlite3',
    database,
    entities,
    migrations,
    migrationsRun: true,
    synchronize: false,
  });
}
