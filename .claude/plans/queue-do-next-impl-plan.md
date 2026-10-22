# Queue doNext() Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `apps/queue` stub with a NestJS `QueueService.doNext()` that reads robots (by `displayId`) and their head queued command, deletes it, and returns one promise per robot resolving to `{ robot, command }` or `null`.

**Architecture:** The queue moves into the API as `apps/api/src/queue/` (QueueModule + QueueService). Robot gains a `displayId` column. The plain-TS `Engine` stays HTTP-free: it receives a `doNext` function in its constructor, and `EngineService` passes `() => queue.doNext()`. `step()` awaits the array, then `Promise.all` of it. Executing LEFT/RIGHT/MOVE is out of scope (separate plan).

**Tech Stack:** NestJS 12, TypeORM 1 + better-sqlite3, Vitest.

**Spec:** `.claude/rules/queue.md` (doNext section + Testing), `.claude/rules/commands.md` (Identity), `.claude/rules/engine.md` (step). User decisions from 2026-10-22 below.

## Decisions (from the user, 2026-10-22)

- Add a `displayId` column to Robot: integer, NOT NULL, unique. Existing rows are backfilled with `id`. On create, `displayId` is optional; when omitted it equals the new robot's `id`. No web change.
- Queue moves into NestJS at `apps/api/src/queue/`. `apps/queue/` is deleted.
- `doNext(): Promise<Promise<NextCommand | null>[]>`: awaits the robot query, then returns one promise per robot found.
- A robot's promise resolves to `null` when its queue is empty or its command fails to parse (the parse-failed command is still deleted).
- Result item: `{ robot, command }`.
- Scope: doNext only. `step()` awaits the promises but does not execute commands.

## Global Constraints

- TypeScript strict; ESLint + Prettier must pass.
- Schema changes only via a migration in `apps/api/database/migrations/`; `synchronize: false`.
- `kebab-case` file names; module → controller → service layering (no controller needed for the queue).
- Engine stays free of Nest/HTTP imports (type-only imports allowed).
- Config files (`package.json` scripts, `vitest.config.ts`, `tsconfig*.json`, `.gitignore`) are edited only after the user approves (CLAUDE.md ground rule). Task 4 lists the exact edits to show them.
- Do not commit without asking. Add a ≤500-char entry to `AI_USAGE.md` per prompt/decision.

## Review Focus

1. Two robots' promises run concurrently: each must delete only its own head command (where clause on `robot.id`), never another robot's.
2. `displayId` order differs from `id` order (e.g. robot id 1 has displayId 5): results must follow `displayId`. Test in Task 3.
3. Lowercase or padded command strings (`move`, ` MOVE`) are parse failures → `null` and deleted. Test in Task 3.
4. Creating a robot with an explicit `displayId` that is already used → 409 Conflict, not a 500. Test in Task 2.
5. A `doNext()` rejection (DB error) still surfaces through `step()` and EngineService (500 / errors under the grid). Test in Task 4.

---

### Task 1: Rules and docs

**Files:**
- Modify: `.claude/rules/queue.md`, `.claude/rules/commands.md`, `.claude/rules/engine.md`, `CLAUDE.md`

- [ ] **Step 1: queue.md**
  - `paths:` → `"apps/api/src/queue/**"`. Location → `apps/api/src/queue` (QueueModule + QueueService).
  - doNext section: replace the promise/skip/"left out" lines with: returns `Promise<Promise<NextCommand | null>[]>`, one inner promise per robot found, in ascending `displayId` order; each resolves to `{ robot, command }`; empty queue or unparseable command → `null`. Keep FIFO, delete-whether-or-not-it-parses, and "does not execute".
  - Testing: "Returns a promise of an array with one promise per robot"; "Empty queue → that robot's promise resolves to `null`"; "Unparseable command → `null`, and it is deleted"; "No robots → empty array". Remove "not in the result" lines.
- [ ] **Step 2: commands.md** — `paths:` replace `apps/queue/**` with `apps/api/src/queue/**` (already covered by `apps/api/**`; just drop `apps/queue/**`). Tick execution item 1: "`doNext()` returns one promise per robot, in `displayId` order, each resolving to its head command (or `null`); the head is deleted."
- [ ] **Step 3: engine.md** — step(): "`step()` calls `doNext()` (injected; QueueService in the API) and awaits the returned array and every promise in it."
- [ ] **Step 4: CLAUDE.md** — folder structure: drop `apps/queue/`, add `apps/api/src/queue/  Queue (doNext)`. Rules list: `queue.md` — `apps/api/src/queue/**`; `commands.md` — `apps/api/**`, `apps/engine/**`.

### Task 2: Robot `displayId`

**Files:**
- Modify: `apps/api/database/entities/robot.entity.ts`, `apps/api/src/robot/dto/create-robot.dto.ts`, `apps/api/src/robot/robot.service.ts`
- Create: `apps/api/database/migrations/<timestamp>-robot-display-id.ts`
- Test: `apps/api/src/robot/robot.service.spec.ts`, `apps/api/test/robot.e2e-spec.ts`

**Interfaces:**
- Produces: `Robot.displayId: number` (column `display_id`, integer, unique, NOT NULL). `CreateRobotDto.displayId?: number`.

- [ ] **Step 1: Write failing tests** in `robot.service.spec.ts`:
  - `create without displayId sets displayId = id` → `expect(robot.displayId).toBe(robot.id)` for two robots in a row.
  - `create with displayId 7 stores 7`.
  - `create with a displayId already in use → ConflictException`.
  - e2e: `POST /robots` with `{ direction: 0, cellId, displayId: 'x' }` → 400.
- [ ] **Step 2: Run** `npm run test -w apps/api -- robot.service` → FAIL (no `displayId`).
- [ ] **Step 3: Entity** — `@Column({ name: 'display_id', type: 'integer', unique: true }) displayId: number;`
- [ ] **Step 4: Migration** — `npm run db:migrate:generate -- database/migrations/robot-display-id` (from `apps/api`, or root with `-w apps/api`). In the generated `up`, the `INSERT INTO "temporary_robot"(...) SELECT ...` must copy `"id"` into `"display_id"` (backfill). Keep the generated `down`.
- [ ] **Step 5: DTO** — `displayId?: number` with `@ValidateIf((_, v) => v !== undefined) @IsInt() @Min(1)` (same optional style as `UpdateRobotDto`).
- [ ] **Step 6: Service** — `create()` runs in `this.repo.manager.transaction`: when `displayId` is given, save with it; otherwise save with placeholder `displayId: -1`, then update the row's `displayId` to its new `id`. Map a unique-constraint error (`SQLITE_CONSTRAINT_UNIQUE`) to `ConflictException('Robot displayId <n> already exists')`. Return the reloaded robot.
- [ ] **Step 7: Run** `npm run db:migrate`, then `npm run test -w apps/api` and `npm run test:e2e -w apps/api` → PASS.

### Task 3: QueueModule / QueueService.doNext()

**Files:**
- Create: `apps/api/src/queue/queue.module.ts`, `apps/api/src/queue/queue.service.ts`, `apps/api/src/queue/next-command.ts`
- Test: `apps/api/src/queue/queue.service.spec.ts`

**Interfaces:**
- Consumes: `Robot.displayId` (Task 2), `COMMANDS` / `Command` from `apps/api/src/shared/types.ts`.
- Produces:
  - `next-command.ts`: `export interface NextCommand { robot: Robot; command: Command }` and `export type DoNext = () => Promise<Promise<NextCommand | null>[]>`.
  - `QueueService.doNext(): Promise<Promise<NextCommand | null>[]>`.
  - `QueueModule` imports `TypeOrmModule.forFeature([Robot, QueuedCommand])`, provides and exports `QueueService`.

- [ ] **Step 1: Write failing tests** (`sqliteTestDb(':memory:')` + `QueueModule`, seed floor/cells/robots/commands through repositories, like `floor.service.spec.ts`). Helper: `const run = async () => Promise.all(await service.doNext())`.
  - `returns a promise of an array of promises` → `const outer = service.doNext(); expect(outer).toBeInstanceOf(Promise); const inner = await outer; expect(inner[0]).toBeInstanceOf(Promise)`.
  - `no robots → []`.
  - `one promise per robot, in displayId order` → robots `{id 1, displayId 5}`, `{id 2, displayId 2}` each with a MOVE → `(await run()).map(r => r?.robot.displayId)` equals `[2, 5]`.
  - `only the oldest command is returned; the rest stay` → robot with `LEFT`, `MOVE` → result command `'LEFT'`; remaining commands for the robot equal `['MOVE']`.
  - `LEFT / RIGHT / MOVE are parsed` → three robots → commands `['LEFT','RIGHT','MOVE']`, each with its `robot.id`.
  - `empty queue → null`.
  - `unparseable command → null and deleted` → commands `'JUMP'` and `'move'` on two robots → both `null`; `queued_command` count is 0.
  - `every command taken is deleted` → after one `run()` with 3 robots × 2 commands, 3 remain, one per robot.
- [ ] **Step 2: Run** `npm run test -w apps/api -- queue.service` → FAIL (module missing).
- [ ] **Step 3: Implement** `QueueService` with injected `Repository<Robot>` and `Repository<QueuedCommand>`. `doNext()` loads robots `order: { displayId: 'ASC' }, relations: { cell: true }` and maps each to private `takeNext(robot): Promise<NextCommand | null>`: find the head (`where: { robot: { id: robot.id } }, order: { id: 'ASC' }`), return `null` if none, delete it by `id`, return `{ robot, command }` when `COMMANDS` includes the exact string, else `null`.
- [ ] **Step 4: Run** the queue tests → PASS.

### Task 4: Engine uses the injected doNext; remove `apps/queue`

**Files:**
- Modify: `apps/engine/engine.ts`, `apps/engine/engine.spec.ts`, `apps/engine/tsconfig.json`, `apps/api/src/engine/engine.service.ts`, `apps/api/src/engine/engine.service.spec.ts`, `apps/api/src/engine/engine.module.ts`, `apps/api/test/engine.e2e-spec.ts` (only if it breaks)
- Delete: `apps/queue/` (all files)
- Config (show the user, edit after approval): `apps/api/package.json` (drop `../queue/**/*.ts` from `format`; `{engine,queue}` → `engine` in `lint`), `apps/api/vitest.config.ts` (drop `'../queue/**/*.spec.ts'`), `apps/api/tsconfig.build.json` (drop `"../queue"`), `apps/engine/tsconfig.json` (drop `"../queue/**/*.ts"`), `.gitignore` (drop the 3 `apps/queue/**` lines)

**Interfaces:**
- Consumes: `DoNext`, `QueueService`, `QueueModule` (Task 3).
- Produces: `new Engine(doNext: DoNext, onError?: (error: unknown) => void)`.

- [ ] **Step 1: Update tests first**
  - `engine.spec.ts`: drop `vi.mock`; build engines with `const doNext = vi.fn<DoNext>().mockResolvedValue([])`. Add `step() waits for every per-robot promise` (outer resolves to `[pending]`; `step()` not done until `pending` resolves) and `step() rejects when a per-robot promise rejects`. Keep the existing step/toggle tests on the new constructor.
  - `engine.service.spec.ts`: drop `vi.mock`; `service = new EngineService({ doNext } as unknown as QueueService)` with `doNext` a `vi.fn` resolving to `[]`. Keep the existing 400/500 cases (500 from `doNext` rejecting).
- [ ] **Step 2: Run** `npm run test -w apps/api -- engine` → FAIL (constructor signature).
- [ ] **Step 3: Engine** — `import type { DoNext } from '../api/src/queue/next-command.js'`; constructor `(private readonly doNext: DoNext, private readonly onError = ...)`; `step()`: `this.currentTick += 1; await Promise.all(await this.doNext());`.
- [ ] **Step 4: EngineService** — inject `QueueService`; create the engine in the constructor body (not a field initializer, so `queue` is assigned first): `this.engine = new Engine(() => this.queue.doNext(), (e) => this.errors.push(errorMessage(e)))`. `EngineModule` imports `QueueModule`.
- [ ] **Step 5: Delete `apps/queue/`**, then apply the approved config edits above.
- [ ] **Step 6: Verify** from repo root: `npm run test`, `npm run test:e2e -w apps/api`, `npm run lint`, `npm run build` → all pass; `grep -rn "apps/queue\|queue/do-next" apps --include=*.ts` (excluding node_modules/dist) → no hits.
- [ ] **Step 7:** Add an `AI_USAGE.md` entry; ask the user before committing.
