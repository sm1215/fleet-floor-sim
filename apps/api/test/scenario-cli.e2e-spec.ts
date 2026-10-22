import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Runs the built CLI exactly as `npm run scenario` does, with its own DB config.
const apiDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(apiDir, '../..');
const main = join(apiDir, 'dist-scenario/src/scenario/main.js');
const normalize = (s: string) => s.replace(/\r\n/g, '\n').replace(/\n$/, '');

describe('scenario CLI (built)', () => {
  let tmp: string;
  let dbPath: string;

  beforeAll(() => {
    execSync('npx nest build -p tsconfig.scenario.json', {
      cwd: apiDir,
      stdio: 'ignore',
    });
  }, 180_000);

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'scenario-cli-'));
    dbPath = join(tmp, 'never.sqlite');
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  function cli(...args: string[]) {
    return spawnSync(process.execPath, [main, ...args], {
      cwd: apiDir,
      encoding: 'utf8',
      env: { ...process.env, INIT_CWD: repoRoot, DB_PATH: dbPath },
    });
  }

  it('prints only the REPORT output and never touches DB_PATH', () => {
    const run = cli('scenario-5.txt');
    expect(run.status).toBe(0);
    expect(normalize(run.stdout)).toBe(
      normalize(
        readFileSync(
          join(repoRoot, 'scenarios/expected/scenario-5-report.txt'),
          'utf8',
        ),
      ),
    );
    expect(run.stderr).toBe('');
    expect(existsSync(dbPath)).toBe(false);
  });

  it('resolves a path relative to where npm was run', () => {
    const run = cli('scenarios/scenario-1.txt');
    expect(run.status).toBe(0);
    expect(run.stdout).toBe('R1 1,0,EAST\nR2 2,0,EAST\nR3 3,0,EAST\n');
  });

  it('a missing file prints to stderr and exits non-zero', () => {
    const run = cli('nope.txt');
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr).toBe('Scenario file not found: nope.txt\n');
  });

  it('no argument prints usage and exits non-zero', () => {
    const run = cli();
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain('Usage: npm run scenario -- <file>');
  });
});
