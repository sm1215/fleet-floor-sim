import type { EngineService } from '../engine/engine.service.js';
import { DEFAULT_FLOOR_SIZE } from '../floor/floor.model.js';
import { parseLine, type ScenarioCommand } from './parse-line.js';

async function dispatch(
  engine: EngineService,
  command: ScenarioCommand,
  write: (out: string) => void,
): Promise<void> {
  switch (command.kind) {
    case 'FLOOR':
      await engine.floor(command.width, command.height);
      return;
    case 'OBSTACLE':
      await engine.obstacle(command.x, command.y);
      return;
    case 'PLACE':
      await engine.place(
        command.displayId,
        command.x,
        command.y,
        command.direction,
      );
      return;
    case 'QUEUE':
      await engine.queue(command.displayId, command.commands);
      return;
    case 'TICK':
      await engine.tick(command.amount);
      return;
    case 'REPORT':
      write((await engine.report()).join('\n') + '\n');
  }
}

/**
 * Runs a scenario on a fresh default floor. Invalid and ignored lines are
 * skipped silently; only REPORT output is written. The floor is cleared after.
 */
export async function runScenario(
  engine: EngineService,
  text: string,
  write: (out: string) => void,
): Promise<void> {
  engine.scenarioMode = true;
  const start: ScenarioCommand = {
    kind: 'FLOOR',
    width: DEFAULT_FLOOR_SIZE,
    height: DEFAULT_FLOOR_SIZE,
  };
  const commands = text.split(/\r?\n/).map(parseLine);
  try {
    for (const command of [start, ...commands]) {
      if (!command) continue;
      try {
        await dispatch(engine, command, write);
      } catch {
        // A failing line never stops the run (scenario-runner.md).
      }
    }
  } finally {
    await engine.clear();
  }
}
