# Scenario Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run scenario -- <file>` runs a plain-text scenario against the Engine in an in-memory DB and prints every `REPORT` to stdout.

**Architecture:** The Engine gains the non-tick commands (`floor`, `obstacle`, `place`, `queue`, `tick`, `report`, `clear`). They are implemented in a new `DirectCommandsService` in `src/engine/`, and `EngineService` delegates to it. A pure line parser and a runner loop live in `src/scenario/`. The CLI entry boots a Nest application context (no HTTP) on `:memory:` SQLite with migrations, calls only `EngineService`, and closes the context afterwards. The CLI runs from the `nest build` output, because `tsx`/esbuild cannot emit the decorator metadata Nest's constructor injection needs.

**Tech Stack:** NestJS 12 application context, TypeORM + better-sqlite3, Vitest.

**Spec:** `.claude/rules/scenario-runner.md`, plus `commands.md` (command params and rules), `engine.md` (Commands section), and `log-entry.md` (Report format).

## Global Constraints

- The runner calls `EngineService` only. No other service, repository, or route.
- DB is `:memory:` with `migrationsRun: true`, and `synchronize: false` always. `DB_PATH` is never read by the runner.
- Report line: `${RId} ${X},${Y},${DIRECTION}`, e.g. `R1 2,3,NORTH`. Sorted by ascending `displayId`. No robots → `EMPTY`.
- DIRECTION names: `NORTH` / `EAST` / `SOUTH` / `WEST` = `Direction` 0..3.
- Floor width/height: int 1..20. Default 5 (`DEFAULT_FLOOR_SIZE`).
- Invalid input never throws from Engine command methods. They return `{ ok: false, reason }`.
- ESM imports use the `.js` suffix. Files are `kebab-case`. TypeScript `strict`. Must pass `npm run lint`.
- Do not commit. Ask the user before committing (CLAUDE.md). Ask before changing `package.json` beyond the `scenario` scripts in Task 5.

## Review Focus

1. **Relative paths under `npm -w`:** npm runs the workspace script with cwd = `apps/api`, so a path typed from the repo root would not resolve. Resolve relative args against `process.env.INIT_CWD` (npm's original cwd) → Task 4 test `resolves relative to the given cwd, not process.cwd()`.
2. **Stray stdout:** Nest's logger writes "Starting Nest application…" to stdout. The context must use `{ logger: false }`, or REPORT output no longer matches the expected files → Task 4 test `createScenarioContext prints nothing to stdout`.
3. **CRLF files:** all `scenarios/*.txt` use CRLF. A `\r` left on `TICK\r` or `EAST\r` would make every line invalid → Task 3 test `parses CRLF-split lines` plus Task 4's expected-file run.
4. **Engine throws mid-run:** an unexpected DB error on one line must not abort the run, and cleanup must still happen → Task 4 test `continues after a line whose engine call throws` and `clears the floor even when a line throws`.
5. **PLACE onto an Obstacle or another robot's cell:** commands.md only names "no cell", but `RobotService` and `CellService` reject both → Task 2 tests `place onto an Obstacle is ignored` and `place onto another robot is ignored`. Re-placing a robot on its own cell is allowed.

---

### Task 1: Shared report formatter and direction names

**Files:**
- Modify: `apps/api/src/shared/types.ts`
- Create: `apps/api/src/engine/report.ts`
- Test: `apps/api/src/engine/report.spec.ts`

**Interfaces:**
- Produces: `DIRECTION_NAMES: readonly ['NORTH','EAST','SOUTH','WEST']` (index = `Direction`) in `shared/types.ts`.
- Produces: `interface ReportRobot { displayId: number; x: number; y: number; direction: Direction }` and `formatReport(robots: ReportRobot[]): string[]` in `engine/report.ts`. Returns lines in ascending `displayId` order without mutating the input, or `['EMPTY']`.

- [ ] **Step 1: Write failing tests** in `report.spec.ts`:
  - `formats one line per robot`: `[{displayId:1,x:2,y:3,direction:Direction.N}]` → `['R1 2,3,NORTH']`.
  - `sorts by displayId`: input displayIds `[2, 1]` (E and S) → `['R1 …,SOUTH', 'R2 …,EAST']` with exact strings.
  - `returns EMPTY with no robots`: `[]` → `['EMPTY']`.
  - `maps all four directions`: W → `WEST`.
- [ ] **Step 2: Run** `npx vitest run src/engine/report.spec.ts` (in `apps/api`). Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `DIRECTION_NAMES` and `formatReport` as specified.
- [ ] **Step 4: Run** the same command. Expected: PASS.

### Task 2: Engine owns FLOOR / OBSTACLE / PLACE / QUEUE / TICK / REPORT

**Files:**
- Create: `apps/api/src/floor/floor-writes.ts` (DB helpers shared by `FloorService` and the Engine)
- Modify: `apps/api/src/floor/floor.service.ts`: `create()`, `reset()`, and `update()` use the helpers. Behavior is unchanged, and `update()` still throws `ConflictException(RESIZE_NO_ROOM)`.
- Create: `apps/api/src/engine/command-result.ts`
- Create: `apps/api/src/engine/direct-commands.service.ts`
- Modify: `apps/api/src/engine/engine.module.ts` (provide `DirectCommandsService`)
- Modify: `apps/api/src/engine/engine.service.ts`
- Test: `apps/api/src/engine/direct-commands.service.spec.ts` (SQLite, same setup as `engine-commands.service.spec.ts`: `sqliteTestDb(':memory:')` + `EngineModule`)
- Test: `apps/api/src/engine/engine.service.spec.ts` (add `tick` / delegation cases using the existing mocks)

**Interfaces:**
- Produces in `floor-writes.ts`:
  - `insertOpenCells(manager: EntityManager, floor: Floor): Promise<void>` (moved from `FloorService`).
  - `resizeFloor(manager: EntityManager, id: number, size: { width: number; height: number }): Promise<boolean>`. Returns `false` when `planResize` returns null, with nothing written. Otherwise it applies the plan exactly as `FloorService.update` does today.
- Produces in `command-result.ts`: `type CommandResult = { ok: true } | { ok: false; reason: string }`.
- Produces on `DirectCommandsService`, and as the same-named delegating methods on `EngineService`:
  - `floor(width: number, height: number): Promise<CommandResult>`. Non-int or outside 1..20 → ignored. No floor row → create it with Open cells. Otherwise resize the single floor. No room → `{ ok:false, reason: RESIZE_NO_ROOM }`.
  - `obstacle(x: number, y: number): Promise<CommandResult>`. No floor, no cell at x/y, or a robot on the cell → ignored. Otherwise `obstacle = true`.
  - `place(displayId: number, x: number, y: number, direction: Direction): Promise<CommandResult>`. Ignored when there's no cell, the cell is an Obstacle, or another robot is on it. Existing `displayId` → update its cell and direction. Otherwise insert a new robot with that `displayId`.
  - `queue(displayId: number, commands: Command[]): Promise<CommandResult>`. Unknown robot, empty list, or any value not in `COMMANDS` → ignored and nothing is enqueued. Otherwise insert the `QueuedCommand` rows in list order (`params: null`) in one transaction.
  - `report(): Promise<string[]>`, i.e. `formatReport` over all robots with their cells.
  - `clear(): Promise<void>`. Deletes every QueuedCommand, Robot, Cell, and Floor row (in that FK order).
- Produces on `EngineService` only:
  - `scenarioMode = false` (public field). It's only a flag for now; tick logging isn't implemented yet.
  - `tick(amount = 1): Promise<CommandResult>`. A non-int or `amount < 1` → ignored. Otherwise it awaits `step()` `amount` times. While `running`, it returns `{ ok:false, reason: STEP_WHILE_RUNNING }` and never steps.
- Constructor: `EngineService(queue, commands, direct: DirectCommandsService)`. Update `new EngineService(...)` in `engine.service.spec.ts` to pass a mock third argument.

- [ ] **Step 1: Write failing tests** in `direct-commands.service.spec.ts`:
  - `floor creates a 5x5 Open floor when none exists`: 1 floor row, 25 cells, all `obstacle=false`.
  - `floor resizes the existing floor`: `floor(5,5)` then `floor(4,3)` → still 1 floor row, width 4, height 3, 12 cells.
  - `floor ignores 0, 21 and non-ints`: each returns `ok:false`, and nothing changes.
  - `obstacle sets the cell; ignores missing cell and robot cell`.
  - `place creates R7 with displayId 7`, then `place moves and turns an existing robot`.
  - `place onto an Obstacle is ignored`, `place onto another robot is ignored`, `place outside the floor is ignored`.
  - `queue enqueues several commands in order`: `queue(1, ['MOVE','RIGHT','MOVE'])` → rows in ascending id with commands `MOVE, RIGHT, MOVE`.
  - `queue ignores unknown robot and rejects the whole list on one bad command`: `['MOVE','JUMP']` → 0 rows.
  - `report returns sorted lines and EMPTY`: after placing R2 at 0,0 NORTH and R1 at 3,2 WEST → `['R1 3,2,WEST','R2 0,0,NORTH']`.
  - `clear removes every floor, cell, robot and queued command`: all four counts are 0.

  In `engine.service.spec.ts`:
  - `tick(3) steps three times`: `currentTick` 3, `doNext` called 3×.
  - `tick ignores 0 and 1.5`: `ok:false` and `currentTick` unchanged.
  - `tick while running is ignored`.
  - `delegates floor/obstacle/place/queue/report/clear to DirectCommandsService`: one assertion per method.
  - `scenarioMode defaults to false`.
- [ ] **Step 2: Run** `npx vitest run src/engine src/floor`. Expected: new tests FAIL, existing floor tests PASS.
- [ ] **Step 3: Implement** `floor-writes.ts` and refactor `FloorService` onto it.
- [ ] **Step 4: Run** `npx vitest run src/floor`. Expected: PASS (refactor safe).
- [ ] **Step 5: Implement** `command-result.ts`, `DirectCommandsService`, the module provider, and the `EngineService` methods and field. Every lookup uses the single floor row (`findOne` ordered by id), per log-entry.md's "only one floor exists at a time". Each method that writes more than one row runs in one `dataSource.transaction`.
- [ ] **Step 6: Run** `npx vitest run` and `npm run test:e2e`. Expected: all PASS.

### Task 3: Line parser

**Files:**
- Create: `apps/api/src/scenario/parse-line.ts`
- Test: `apps/api/src/scenario/parse-line.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  type ScenarioCommand =
    | { kind: 'FLOOR'; width: number; height: number }
    | { kind: 'OBSTACLE'; x: number; y: number }
    | { kind: 'PLACE'; displayId: number; x: number; y: number; direction: Direction }
    | { kind: 'QUEUE'; displayId: number; commands: Command[] }
    | { kind: 'TICK'; amount: number }
    | { kind: 'REPORT' };
  parseLine(line: string): ScenarioCommand | null
  ```
- Rules: trim and uppercase the line. Blank lines and lines starting with `#` → null. The keyword is the first whitespace-separated token. For PLACE / QUEUE / LEFT / RIGHT / MOVE, the next token is the `RId` (`/^R(\d+)$/`). The remaining text is split on `,` with each part trimmed. Ints match `/^\d+$/`; `TICK` also accepts only `/^\d+$/` and leaves range checks to the Engine. `FLOOR` with 0, 1, or 2 parts fills missing values with `DEFAULT_FLOOR_SIZE`. `TICK` with none → 1. `QUEUE` splits its remainder on whitespace into commands (no commas). `LEFT R1` / `RIGHT R1` / `MOVE R1` → `{kind:'QUEUE', commands:['LEFT']}` etc. Any extra or empty part, or an invalid token → null.

- [ ] **Step 1: Write failing tests** (exact objects):
  - `PLACE R1 0,0,EAST` → `{kind:'PLACE',displayId:1,x:0,y:0,direction:Direction.E}`.
  - `place r1 0 , 0 , east` → same.
  - `FLOOR 4,3` → 4/3. `FLOOR` → 5/5. `FLOOR 4` → 4/5.
  - `QUEUE R2 MOVE RIGHT MOVE` → `commands:['MOVE','RIGHT','MOVE']`. `move r3` → `{kind:'QUEUE',displayId:3,commands:['MOVE']}`.
  - `TICK` → 1. `TICK 10` → 10. `REPORT` → `{kind:'REPORT'}`. `OBSTACLE 2,3` → 2/3.
  - `parses CRLF-split lines`: `'TICK 3\r'` → amount 3.
  - Each → null: `''`, `'   '`, `'# PLACE R1 0,0,EAST'`, `'JUMP R1'`, `'PLACE 1 0,0,EAST'`, `'PLACE R1 0,0'`, `'PLACE R1 0,0,UP'`, `'PLACE R1 -1,0,EAST'`, `'PLACE R1 0,0,EAST,X'`, `'FLOOR 4,3,2'`, `'TICK 1 2'`, `'REPORT NOW'`, `'QUEUE R1'`, `'QUEUE R1 MOVE JUMP'`, `'R1 1,0,EAST'`.
- [ ] **Step 2: Run** `npx vitest run src/scenario/parse-line.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `parseLine`, importing `DIRECTION_NAMES`, `COMMANDS`, and `DEFAULT_FLOOR_SIZE`.
- [ ] **Step 4: Run** the same command. Expected: PASS.

### Task 4: Runner, context, path resolution, and expected-output check

**Files:**
- Create: `apps/api/src/scenario/run-scenario.ts`
- Create: `apps/api/src/scenario/scenario-context.ts`
- Create: `apps/api/src/scenario/resolve-scenario-path.ts`
- Test: `apps/api/src/scenario/run-scenario.spec.ts` (mock `EngineService`)
- Test: `apps/api/src/scenario/resolve-scenario-path.spec.ts` (temp dir via `fs.mkdtempSync(os.tmpdir())`)
- Test: `apps/api/test/scenario.e2e-spec.ts`

**Interfaces:**
- Consumes: `EngineService.{scenarioMode, floor, obstacle, place, queue, tick, report, clear}` (Task 2), `parseLine` (Task 3).
- Produces:
  - `runScenario(engine: EngineService, text: string, write: (out: string) => void): Promise<void>`. Sets `engine.scenarioMode = true`, then calls `await engine.floor(DEFAULT_FLOOR_SIZE, DEFAULT_FLOOR_SIZE)`. For each line of `text.split(/\r?\n/)`, it runs `parseLine` and dispatches to the matching Engine method. Results are ignored. `REPORT` → `write(lines.join('\n') + '\n')`. Each line's call is wrapped in `try/catch`, and errors are skipped silently. `engine.clear()` runs in `finally`.
  - `scenarioDbOptions(migrations: TypeOrmModuleOptions['migrations']): TypeOrmModuleOptions`, i.e. `{ type:'better-sqlite3', database:':memory:', entities, migrations, migrationsRun:true, synchronize:false }`.
  - `createScenarioContext(db: DynamicModule): Promise<INestApplicationContext>`, i.e. `NestFactory.createApplicationContext({ module: ScenarioModule, imports: [db, EngineModule] }, { logger: false })`. `ScenarioModule` is an empty `@Module({})` class in the same file.
  - `resolveScenarioPath(arg: string, cwd: string, scenariosDir: string): string | null`. An absolute path that exists → it. `resolve(cwd, arg)` exists → it. `resolve(scenariosDir, arg)` exists → it. Otherwise null.

- [ ] **Step 1: Write failing tests.**
  - `run-scenario.spec.ts` (mocked engine; `report` resolves `['R1 0,0,NORTH']`):
    - `sets scenarioMode and starts a 5x5 floor`: `floor` first called with `(5,5)`.
    - `dispatches each command`: a text covering all six kinds → the matching mock is called with parsed args, in order.
    - `skips blank, # and invalid lines`: no calls for them, and later lines still run.
    - `writes only REPORT output`: two REPORTs → `write` called twice with `'R1 0,0,NORTH\n'`.
    - `continues after a line whose engine call throws`: `place` rejects once, and the following `TICK` still calls `tick`.
    - `clears the floor even when a line throws`: `clear` called once.
  - `resolve-scenario-path.spec.ts`: `absolute path`, `resolves relative to the given cwd, not process.cwd()`, `falls back to scenariosDir for a bare name`, and `returns null when missing everywhere`.
  - `scenario.e2e-spec.ts`:
    - For each `scenarios/*.txt` with a matching `scenarios/expected/<name>-report.txt`: build the context with `createScenarioContext(sqliteTestDb(':memory:'))`, run it with `write` collecting into a string, and expect the result to equal the expected file. Normalize both sides: CRLF→LF, then drop one trailing `\n`. Read files via `resolve(import.meta.dirname, '../../../scenarios')`. Assert at least 5 pairs were found, so the glob can't silently match nothing.
    - `starts on a fresh 5x5 floor`: a text containing only `REPORT` → `EMPTY`; then `PLACE R1 4,4,NORTH` + `REPORT` → `R1 4,4,NORTH`.
    - `leaves no rows after the run`: after `runScenario`, Floor/Cell/Robot/QueuedCommand counts are all 0 (via `app.get(DataSource)`).
    - `createScenarioContext prints nothing to stdout`: spy on `process.stdout.write` while creating and closing the context → not called.
    - `scenarioDbOptions uses :memory: and runs migrations`: `database === ':memory:'`, `migrationsRun === true`, `synchronize === false`.
- [ ] **Step 2: Run** `npx vitest run src/scenario` and `npm run test:e2e`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the three files.
- [ ] **Step 4: Run** the same commands. Expected: PASS, with all five scenarios matching their expected files.

### Task 5: CLI entry and npm scripts

**Files:**
- Create: `apps/api/src/scenario/main.ts`
- Modify: `apps/api/package.json`: add `"scenario": "nest build && node dist/src/scenario/main.js"`
- Modify: `package.json` (root): add `"scenario": "npm run scenario -w apps/api --"`
- Modify: `CLAUDE.md`: in the Commands table, `npm run scenario` Status → `Exists`. Add a note that it builds first, and that `npm run -s scenario -- …` suppresses npm's own banner lines on stdout.

**Interfaces:**
- Consumes: `resolveScenarioPath`, `createScenarioContext`, `scenarioDbOptions`, `runScenario` (Task 4).
- Behavior of `main.ts` (top-level `await`, ESM):
  1. `arg = process.argv[2]`. Missing → stderr `Usage: npm run scenario -- <file>`, `process.exitCode = 1`, return.
  2. `path = resolveScenarioPath(arg, process.env.INIT_CWD ?? process.cwd(), resolve(import.meta.dirname, '../../../../../scenarios'))`. The compiled file is `apps/api/dist/src/scenario/main.js`, so five levels up is the repo root. Null → stderr `Scenario file not found: <arg>`, exit code 1.
  3. `createScenarioContext(TypeOrmModule.forRoot(scenarioDbOptions([resolve(import.meta.dirname, '../../database/migrations/*.js')])))`.
  4. `runScenario(app.get(EngineService), readFileSync(path, 'utf8'), (s) => process.stdout.write(s))`, then close the app in `finally`.

- [ ] **Step 1: Implement** `main.ts` and the scripts, then run `npm run build -w apps/api`. Expected: `apps/api/dist/src/scenario/main.js` and `apps/api/dist/database/migrations/*.js` exist.
- [ ] **Step 2: Verify** from the repo root, for each n in 1..5: `npm run -s scenario -- scenario-n.txt` prints exactly `scenarios/expected/scenario-n-report.txt` (compare with `diff <(npm run -s scenario -- scenario-n.txt) <(tr -d '\r' < scenarios/expected/scenario-n-report.txt)` in Git Bash). Expected: no diff.
- [ ] **Step 3: Verify** that `npm run -s scenario -- scenarios/scenario-1.txt` (relative from the root) works. `npm run -s scenario -- nope.txt` → stderr message, exit code 1. `npm run -s scenario` → usage, exit code 1.
- [ ] **Step 4: Verify** that `apps/api/data/fleet.sqlite` has the same modified time before and after Step 2.
- [ ] **Step 5: Run** `npm run lint`, `npm run test`, `npm run test:e2e -w apps/api`, and `npm run build`. Expected: all pass.
- [ ] **Step 6:** Add an `AI_USAGE.md` entry (≤ 500 chars). Ask the user before committing.

## Out of scope

- `POST /commands/*` HTTP routes (commands.md). They will call these same Engine methods in a later plan.
- `TICK` log entries and the Log modal (log-entry.md). `scenarioMode` is added here as a flag only.
