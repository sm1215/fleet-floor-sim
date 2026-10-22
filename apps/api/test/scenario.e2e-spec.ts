import type { INestApplicationContext } from '@nestjs/common';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import {
  Cell,
  Floor,
  LogEntry,
  QueuedCommand,
  Robot,
} from '../database/entities/index.js';
import { EngineService } from '../src/engine/engine.service.js';
import { runScenario } from '../src/scenario/run-scenario.js';
import {
  createScenarioContext,
  scenarioDbOptions,
} from '../src/scenario/scenario-context.js';
import { sqliteTestDb } from './sqlite-test-db.js';

const scenariosDir = resolve(import.meta.dirname, '../../../scenarios');
const normalize = (s: string) => s.replace(/\r\n/g, '\n').replace(/\n$/, '');

const pairs = readdirSync(scenariosDir)
  .filter((f) => f.endsWith('.txt'))
  .map((f) => ({
    name: f.replace(/\.txt$/, ''),
    input: resolve(scenariosDir, f),
    expected: resolve(
      scenariosDir,
      'expected',
      f.replace(/\.txt$/, '-report.txt'),
    ),
  }))
  .filter((p) => existsSync(p.expected));

describe('scenario runner (e2e)', () => {
  let app: INestApplicationContext;

  beforeEach(async () => {
    app = await createScenarioContext(sqliteTestDb(':memory:'));
  });

  afterEach(async () => {
    await app.close();
  });

  async function run(text: string): Promise<string> {
    let out = '';
    await runScenario(app.get(EngineService), text, (s) => (out += s));
    return out;
  }

  it('finds the scenario files', () => {
    expect(pairs.length).toBeGreaterThanOrEqual(5);
  });

  it.each(pairs)('$name matches its expected report', async (pair) => {
    const out = await run(readFileSync(pair.input, 'utf8'));
    expect(normalize(out)).toBe(normalize(readFileSync(pair.expected, 'utf8')));
  });

  it('starts on a fresh 5x5 floor', async () => {
    expect(await run('REPORT')).toBe('EMPTY\n');
    expect(await run('PLACE R1 4,4,NORTH\nREPORT')).toBe('R1 4,4,NORTH\n');
  });

  it('leaves no rows after the run', async () => {
    await run('PLACE R1 0,0,NORTH\nQUEUE R1 MOVE MOVE\nTICK');
    const dataSource = app.get(DataSource);
    for (const entity of [Floor, Cell, Robot, QueuedCommand]) {
      expect(await dataSource.getRepository(entity).count()).toBe(0);
    }
  });

  it('scenario mode writes no log entries', async () => {
    await run(
      [
        'FLOOR 4,4',
        'OBSTACLE 3,3',
        'PLACE R1 0,0,NORTH',
        'MOVE R1',
        'TICK 2',
        'REPORT',
      ].join('\n'),
    );
    expect(app.get(EngineService).scenarioMode).toBe(true);
    const logEntries = app.get(DataSource).getRepository(LogEntry);
    expect(await logEntries.count()).toBe(0);
  });

  it('createScenarioContext prints nothing to stdout', async () => {
    const spy = vi.spyOn(process.stdout, 'write');
    try {
      const other = await createScenarioContext(sqliteTestDb(':memory:'));
      await other.close();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('scenarioDbOptions uses :memory: and runs migrations', () => {
    expect(scenarioDbOptions([])).toMatchObject({
      database: ':memory:',
      migrationsRun: true,
      synchronize: false,
    });
  });
});
