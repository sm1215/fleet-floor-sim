import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { entities } from './entities/index.js';

const dbPath = process.env.DB_PATH;
if (!dbPath) throw new Error('DB_PATH is not set');

export default new DataSource({
  type: 'better-sqlite3',
  database: dbPath,
  entities,
  migrations: ['database/migrations/*.ts'],
  synchronize: false,
});
