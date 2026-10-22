import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveScenarioPath } from './resolve-scenario-path.js';

describe('resolveScenarioPath', () => {
  let root: string;
  let cwd: string;
  let scenariosDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'scenario-path-'));
    cwd = join(root, 'cwd');
    scenariosDir = join(root, 'scenarios');
    mkdirSync(join(cwd, 'sub'), { recursive: true });
    mkdirSync(scenariosDir);
    writeFileSync(join(cwd, 'sub', 'local.txt'), 'REPORT');
    writeFileSync(join(scenariosDir, 'named.txt'), 'REPORT');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('absolute path', () => {
    const path = join(scenariosDir, 'named.txt');
    expect(resolveScenarioPath(path, '/nowhere', '/nowhere')).toBe(path);
  });

  it('resolves relative to the given cwd, not process.cwd()', () => {
    expect(resolveScenarioPath('sub/local.txt', cwd, scenariosDir)).toBe(
      join(cwd, 'sub', 'local.txt'),
    );
  });

  it('falls back to scenariosDir for a bare name', () => {
    expect(resolveScenarioPath('named.txt', cwd, scenariosDir)).toBe(
      join(scenariosDir, 'named.txt'),
    );
  });

  it('returns null when missing everywhere', () => {
    expect(resolveScenarioPath('nope.txt', cwd, scenariosDir)).toBeNull();
    expect(
      resolveScenarioPath(join(root, 'nope.txt'), cwd, scenariosDir),
    ).toBeNull();
  });

  it('ignores a directory with the given name', () => {
    expect(resolveScenarioPath('sub', cwd, scenariosDir)).toBeNull();
  });
});
