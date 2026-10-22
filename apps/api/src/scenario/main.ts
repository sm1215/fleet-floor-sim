import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EngineService } from '../engine/engine.service.js';
import { resolveScenarioPath } from './resolve-scenario-path.js';
import { runScenario } from './run-scenario.js';
import {
  createScenarioContext,
  scenarioDbOptions,
} from './scenario-context.js';

// Runs from dist-scenario/src/scenario/main.js, so the repo root is five levels up.
const scenariosDir = resolve(import.meta.dirname, '../../../../../scenarios');

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    process.stderr.write('Usage: npm run scenario -- <file>\n');
    process.exitCode = 1;
    return;
  }
  // npm runs workspace scripts from apps/api; INIT_CWD is where npm was invoked.
  const path = resolveScenarioPath(
    arg,
    process.env.INIT_CWD ?? process.cwd(),
    scenariosDir,
  );
  if (!path) {
    process.stderr.write(`Scenario file not found: ${arg}\n`);
    process.exitCode = 1;
    return;
  }
  const app = await createScenarioContext(
    TypeOrmModule.forRoot(
      scenarioDbOptions([
        resolve(import.meta.dirname, '../../database/migrations/*.js'),
      ]),
    ),
  );
  try {
    await runScenario(app.get(EngineService), readFileSync(path, 'utf8'), (s) =>
      process.stdout.write(s),
    );
  } finally {
    await app.close();
  }
}

await main();
