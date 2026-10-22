import { statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

const isFile = (path: string) =>
  statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;

/**
 * Finds the scenario file: an absolute path, then relative to `cwd`, then
 * relative to `scenariosDir`. Null when none is a file.
 */
export function resolveScenarioPath(
  arg: string,
  cwd: string,
  scenariosDir: string,
): string | null {
  const candidates = isAbsolute(arg)
    ? [arg]
    : [resolve(cwd, arg), resolve(scenariosDir, arg)];
  return candidates.find(isFile) ?? null;
}
