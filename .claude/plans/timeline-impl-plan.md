# Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a timeline scrubber that shows any past tick of the viewed floor read-only, rebuilt from snapshots plus log replay, and supports Fork From Here, a floor dropdown, a per-floor Reset All and Delete Floor.

**Architecture:** The API becomes multi-floor. The Engine holds an *active floor* and a `currentTick` per floor. Every command, tick, report, log entry and snapshot is scoped to a floor. Every `snapshotFrequency` (10) ticks, a new `tick_history` table stores a JSON `FloorState`. A pure `applyEntry()` replays `log_entry` rows on top of the nearest snapshot to rebuild any tick. The web gets a standalone `Timeline` component under the grid. `App` owns `floorId` / `viewTick` and passes them to `Grid`, which renders either the live floor or a read-only historical `FloorState`.

**Tech Stack:** NestJS 12, TypeORM + better-sqlite3, Vitest; Angular 22 standalone components with signals, Tailwind.

**Spec:** `.claude/plans/timeline-plan.md`

## Decisions (from the user, 2026-10-22)

- "Table" in the spec means **Floor**. UI text says `Floor <id>`, and the button is `Delete Floor`. The spec doc was corrected to say Floor.
- Step / Play act on the **viewed (active) floor** only. Each floor has its own `currentTick`. Switching floors pauses the engine.
- A fork **copies each robot's queue as of the chosen tick**. Snapshots store queues, and replay rebuilds them. After a fork, the view switches to the new floor at its live tick.
- Delete Floor: `window.confirm('Delete this floor?')`. It deletes the floor and everything on it (cells, robots, queues, log entries, snapshots), then shows the lowest-id remaining floor. Deleting the last floor creates a fresh default 5x5.
- Read-only (viewing a past tick) disables: Step, Play (Pause stays enabled while running), Edit, size sliders, cell clicks, Turn Left / Turn Right / Move / Delete, arrow keys, Reset All, Delete Floor. These stay enabled: scrubber, number input, Fork, dropdown, Log, robot selection.
- Snapshot table: entity `TickHistory`, DB table `tick_history`.
- Fork writes **no** log entry.
- Number input out of range or fractional → **clamp**: `Math.floor`, then clamp to `0..currentTick`. Empty / NaN → revert to the scrubber value (nothing to clamp).

## Planner rulings (not in the spec; flag in review if wrong)

- `Robot.display_id` loses its global UNIQUE constraint, because forks copy displayIds. The Engine keeps displayIds unique per floor: PLACE without `rId` = highest displayId **on that floor** + 1.
- `log_entry.floor_id` is a nullable FK, like the existing FKs. The migration backfills existing rows with the lowest floor id.
- `log_entry` gets a `tick` column (int, NOT NULL; user decision): the floor's `currentTick` when the entry was written. A `TICK T` entry has `tick = T`, and a command logged between `TICK T` and `TICK T+1` also has `tick = T`. The migration backfills existing rows with the number of `TICK` rows whose `id <= ` theirs.
- "State at tick T" = the state after `TICK T` plus every command logged before `TICK T+1`. So state at `currentTick` is the live state.
- A snapshot labelled T is written inside the tick transaction at the start of the step from T to T+1, when `T % snapshotFrequency === 0`. It holds exactly the state at T.
- Snapshots are skipped in `scenarioMode`, like log writes: no log means nothing to replay.
- `currentTick` per floor is loaded on module init as `MAX(log_entry.tick)` for that floor (0 when none). This also fixes `TICK 1` being logged again after a server restart.
- New floor routes sit next to Reset (POST, not DELETE, so the crud e2e "no DELETE on resource routes" rule still holds): `POST /floors/:id/fork`, `POST /floors/:id/delete`, `GET /floors/:id/history?tick=N`. Floor selection: `POST /engine/floor`.
- History reads and forks run under the write lock, so they never see a half-written tick.
- `diagrams/fleet-floor-db-entities_v1.excalidraw` is not edited. CLAUDE.md and `database.md` record the new FK and table. The user may want to update the diagram.

## Global Constraints

- TypeScript `strict`; ESLint flat config + Prettier must pass (`npm run lint`, `npm run format`).
- File names `kebab-case`; classes `PascalCase`; functions/variables `camelCase`.
- Schema changes only via a new migration in `apps/api/database/migrations/`; `synchronize: false`; never edit a migration that has already run.
- Controllers handle HTTP only; DTO validation on every request body; the Engine has no HTTP concerns (the scenario runner calls it directly).
- `snapshotFrequency = 10`, a public property on `EngineService`.
- Scrubber: `min 0`, `max currentTick`, step 1.
- Angular standalone components; signals; tests use Vitest with a mocked `SimulationApiService`.
- No commits without asking the user (CLAUDE.md). Each task ends with a **commit checkpoint**: stage the files and ask before committing. Work on `main`; no branches.
- Append a ≤500-character entry to `AI_USAGE.md` when execution finishes.

## Review Focus

1. **Replay across a resize that displaced robots** must equal what was live at that tick. The planResize order depends on robot ids, so snapshots store robot ids and replay-created robots get `max id + 1`. Pinned by the live-vs-replay test in Task 5.
2. **API restart mid-session**: `currentTick` per floor comes back from the log, the next tick logs `TICK n+1` (not `TICK 1`), and history still resolves. Pinned in Task 3 (engine e2e).
3. **Fork of a fork, viewed before the first fork point**: the copied snapshots and log rebuild the same states as the original floor. Pinned in Task 6.
4. **Scrubbing while the engine plays**: `currentTick` keeps rising, a pinned scrubber stays put, and dragging back to max resumes following. Fork uses the scrubber value, not `currentTick`. Pinned in Tasks 9 and 11.
5. **History requested for a tick with no snapshot** (data from before this migration) → 400 `No history for tick N`, never a 500 or a wrong state. Pinned in Task 5.

---

### Task 1: Rules and docs

**Files:**
- Create: `.claude/rules/timeline.md`
- Modify: `.claude/rules/database.md`, `log-entry.md`, `engine.md`, `commands.md`, `frontend.md`, `floor-grid.md`, `robot-rules.md`, `CLAUDE.md` (Entities section, Rules files list)

- [ ] **Step 1: Write `.claude/rules/timeline.md`** with frontmatter `paths`: `apps/api/src/history/**`, `apps/api/src/engine/**`, `apps/api/src/floor/**`, `apps/api/database/**`, `apps/web/src/app/components/timeline/**`, `apps/web/src/app/components/grid/**`, `apps/web/src/app/app.*`, `apps/web/src/app/services/simulation-api.service.ts`. Sections: Floors (active floor, per-floor tick, switching pauses), Snapshots (`tick_history`, `snapshotFrequency`, timing, JSON shape), Reconstruction (state-at-T definition, nearest snapshot + replay, per-action replay table from Task 4), Scrubber (min/max/follow/pin), Number input (input/change, clamp, NaN revert), Read-only (the exact enabled/disabled list from Decisions), Fork, Dropdown, Reset All scope, Delete Floor, API routes, and Testing (the test names from Tasks 3–11).
- [ ] **Step 2: Update the existing rules.** `database.md`: LogEntry → Floor (`floor_id`), LogEntry `tick` column, TickHistory → Floor (`floor_id`, Unique(floor_id, tick)), `display_id` unique per floor (enforced by the Engine). `log-entry.md`: replace "no floor FK / one floor" with per-floor entries, `GET /log-entries?floorId=`, Reset clears only that floor's log. `engine.md`: active floor, per-floor `currentTick`, `snapshotFrequency`, snapshot at start of tick. `commands.md`: commands act on the active floor; PLACE max displayId per floor. `frontend.md`: Reset All resets the viewed floor; Delete Floor button after Reset All. `floor-grid.md`: Initial load picks the active floor; read-only mode. `robot-rules.md`: `GET /robots?floorId=`.
- [ ] **Step 3: Update `CLAUDE.md`.** Add `Tick` to the LogEntry row (Id (PK), Action, Params, Result, Tick), add a `TickHistory` row (Id (PK), Tick, State), the new FKs (LogEntry → Floor, TickHistory → Floor), and `timeline.md` in the Rules files list.
- [ ] **Step 4: Commit checkpoint.** Ask the user before committing: `docs: timeline rules`.

### Task 2: Schema — LogEntry floor FK and tick, TickHistory, per-floor displayId

**Files:**
- Create: `apps/api/database/entities/tick-history.entity.ts`, `apps/api/database/migrations/<ts>-timeline.ts`, `apps/api/test/timeline-schema.e2e-spec.ts`
- Modify: `apps/api/database/entities/log-entry.entity.ts`, `robot.entity.ts`, `index.ts`

**Interfaces:**
- Produces: `TickHistory { id: number; tick: number; state: string /* JSON FloorState */; floor: Relation<Floor> }`, `@Entity('tick_history')`, `@Unique(['floor', 'tick'])`, `tick` column `type: 'integer'`, `state` `type: 'varchar'`, `@JoinColumn({ name: 'floor_id' })`. `LogEntry.floor: Relation<Floor>` (`@ManyToOne(() => Floor)`, `floor_id`), `LogEntry.tick: number` (`@Column({ type: 'integer' })`). `Robot.displayId` without `unique`.

- [ ] **Step 1: Write the failing e2e tests** in `timeline-schema.e2e-spec.ts` (use `sqliteTestDb(':memory:')`):
  - `two robots on different floors may share a displayId` — insert floors A, B with one cell each and robot displayId 1 on each → both saved.
  - `tick_history rejects a duplicate (floor, tick)` — save `{ floor: A, tick: 0 }` twice → second rejects with `SQLITE_CONSTRAINT`.
  - `log_entry.floor_id references floor` — inserting a log entry with `floor: { id: 999 }` rejects with `SQLITE_CONSTRAINT_FOREIGNKEY`.
  - `migration backfills log_entry.tick` — run every migration except the new one, insert `FLOOR` (id 1), `TICK 1` (id 2), `PLACE` (id 3), `TICK 2` (id 4), then run the new one → ticks are 0, 1, 1, 2.
- [ ] **Step 2: Run** `npm run test:e2e -w apps/api -- timeline-schema` → FAIL.
- [ ] **Step 3: Change the entities, then generate the migration** with `npm run db:migrate:generate -w apps/api -- database/migrations/timeline`. Hand-edit the generated `INSERT INTO "temporary_log_entry" … SELECT` so `floor_id` is filled with `(SELECT MIN("id") FROM "floor")` and `tick` with `(SELECT COUNT(*) FROM "log_entry" t WHERE t."action" = 'TICK' AND t."id" <= "log_entry"."id")`. Check that `down()` restores the UNIQUE on `display_id` and drops `tick_history`. Add `TickHistory` to `entities`.
- [ ] **Step 4: Run** the e2e spec → PASS. Then run `npm run db:migrate` on the dev DB, then `npm run db:migrate:revert` and `npm run db:migrate` again → all succeed.
- [ ] **Step 5: Commit checkpoint:** `feat(db): log entry floor FK, tick_history, per-floor displayId`.

### Task 3: Floor-scoped commands, active floor, per-floor tick

**Files:**
- Modify: `apps/api/src/log-entry/log-params.ts`, `log-entry.service.ts`, `log-entry.controller.ts`; `apps/api/src/engine/command-result.ts`, `direct-commands.service.ts`, `engine.service.ts`, `engine.controller.ts`; `apps/api/src/queue/queue.service.ts`; `apps/api/src/robot/robot.service.ts`, `robot.controller.ts`; `apps/api/src/floor/floor.service.ts` (`findAll` ordered by id ASC)
- Create: `apps/api/src/engine/dto/select-floor.dto.ts`
- Test: the matching `*.spec.ts` files, `engine-logging.spec.ts`, `apps/api/test/engine.e2e-spec.ts`, `apps/api/test/robot.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `LogLine { floorId: number; action: LogAction; params: string }`
  - `LogEntryService.create(entry: NewLogEntry & { floorId: number; tick: number }, manager?)`, `findAll(floorId: number)`. `GET /log-entries?floorId=` (ParseIntPipe; missing → 400).
  - `DirectCommandsService.floor(floorId: number | null, width, height, record?)`: null → creates a floor (the result's `log.floorId` is the new id), otherwise resizes that floor. `obstacle(floorId, x, y, record?)`, `place(floorId, displayId | undefined, x, y, direction, record?)`, `queue(floorId, displayId, commands, record?)`, `delete(floorId, displayId, record?)`, `report(floorId, manager?)`. `clear()` also deletes every `log_entry` and `tick_history` row before the floors.
  - `QueueService.doNext(floorId: number, manager?)`: only robots whose cell is on that floor.
  - `RobotService.findAll(floorId: number)`. `GET /robots?floorId=` (required).
  - `EngineService`: `floorId: number | null` (active), `get currentTick(): number` (the active floor's tick, 0 when none), `tickOf(floorId): number`, `setTick(floorId, tick)`, `onModuleInit()` (loads every floor's tick as `MAX(log_entry.tick)` and sets active = lowest floor id). `log()` writes `tick = tickOf(floorId)` for commands and the new tick number for `TICK`, `selectFloor(floorId): Promise<CommandResult>` (unknown → ignored `Floor <id> not found`; stops running; sets active), `EngineState.floorId: number | null`. `floor()` / `obstacle()` / … call `direct` with `this.floorId`; when `floor()` creates a floor, the Engine sets it active with tick 0. Ticks with no active floor are ignored (`No floor`).
  - `POST /engine/floor { floorId: int }` → `EngineState` (400 with the reason when ignored).

- [ ] **Step 1: Write the failing tests**
  - `direct-commands.service.spec.ts`: `PLACE without rId uses the highest displayId on that floor` (floor A has R1, R3; floor B has R7 → PLACE on A gives R4). `QUEUE / DELETE address the robot by displayId on the given floor only` (R1 on A and on B; DELETE on B leaves A's R1). `report() lists only the given floor's robots`. `every log line carries its floorId`. `engine.service.spec.ts`: `a command logged after tick 3 has tick 3; the TICK 4 entry has tick 4`.
  - `queue.service.spec.ts`: `doNext(floorId) takes heads only from that floor's robots`.
  - `engine.service.spec.ts`: `step() advances only the active floor's tick`; `selectFloor() stops a running engine and switches currentTick to that floor's tick`; `selectFloor(unknown) is ignored`; `floor() with no active floor creates one and makes it active at tick 0`; `getState() includes floorId`. Replace `engine.currentTick = 4` in `floor.service.spec.ts` with `engine.setTick(floorId, 4)`.
  - `engine.e2e-spec.ts`: `after an app restart the next step logs TICK n+1 and GET /engine returns n+1` (Review Focus 2). `GET /log-entries?floorId= returns only that floor's entries`.
  - `robot.e2e-spec.ts`: `GET /robots?floorId= returns only that floor's robots`.
- [ ] **Step 2: Run** `npm run test -w apps/api` → the new tests FAIL.
- [ ] **Step 3: Implement the interfaces above.** `currentFloor()` in `DirectCommandsService` is replaced by the `floorId` argument; `cellAt` / `robotOn` / `findOneBy({ displayId })` filter by `cell.floor.id`. Engine `record` passes `line.floorId` to `log()`. `currentTick` moves into a `Map<number, number>`.
- [ ] **Step 4: Run** `npm run test -w apps/api && npm run test:e2e -w apps/api` → PASS. Then run all 5 scenarios (`npm run -s scenario -- scenario-N.txt`) → output still matches `scenarios/expected/`.
- [ ] **Step 5: Commit checkpoint:** `feat(api): floor-scoped commands, active floor, per-floor tick`.

### Task 4: Replay (pure)

**Files:**
- Create: `apps/api/src/history/floor-state.ts`, `apps/api/src/history/replay.ts`, `apps/api/src/history/replay.spec.ts`

**Interfaces:**
- Produces:
  - `interface FloorState { width: number; height: number; cells: { x: number; y: number; obstacle: boolean }[]; robots: { id: number; displayId: number; x: number; y: number; direction: Direction; queue: Command[] }[] }`. Cells are sorted by y then x; robots by displayId.
  - `applyEntry(state: FloorState, entry: Pick<LogEntry, 'action' | 'params' | 'result'>): FloorState` (returns a new state; never mutates).

Replay per action (params formats are the ones in `log-params.ts`; reuse `DIRECTION_NAMES`):

| Action | Effect |
| --- | --- |
| `FLOOR w, h, CREATED` | all-Open w×h, no robots |
| `FLOOR w, h, RESIZED` | `planResize()` (`floor.model.ts`) with cell ids = index and robot `{ id, cellId }`; apply create/delete/moves |
| `OBSTACLE x, y, ON\|OFF` | set that cell's `obstacle` |
| `PLACE R<d> x, y, DIR` | existing displayId → move and turn; new → `id = max(ids, 0) + 1`, empty queue |
| `QUEUE R<d> CMD…` | append the commands to that robot's queue |
| `DELETE R<d>` | remove the robot (its queue goes with it) |
| `TICK n` | pop the queue head of every robot whose queue is non-empty; then set each robot's x/y/direction from the result lines `R<d> x,y,DIR` (`EMPTY` → no robots to update) |

- [ ] **Step 1: Write the failing tests**, one per table row plus: `TICK pops one head per robot, including robots that did not move`, `RESIZED moves a displaced robot to the nearest free Open cell (same as planResize)`, `PLACE of a new robot gets an id above every existing id`, `applyEntry does not mutate its input`.
- [ ] **Step 2: Run** `npm run test -w apps/api -- replay` → FAIL.
- [ ] **Step 3: Implement** `floor-state.ts` and `replay.ts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit checkpoint:** `feat(api): log replay onto a floor state`.

### Task 5: Snapshots, history reads

**Files:**
- Create: `apps/api/src/history/history.service.ts`, `history.module.ts`, `history.service.spec.ts`
- Modify: `apps/api/src/engine/engine.service.ts`, `engine.module.ts`; `apps/api/src/floor/floor.controller.ts`, `floor.module.ts`
- Test: `apps/api/test/history.e2e-spec.ts`

**Interfaces:**
- Consumes: `FloorState`, `applyEntry` (Task 4); `EngineService.tickOf` (Task 3).
- Produces:
  - `HistoryService.liveState(manager, floorId): Promise<FloorState>` (from the DB, queues in FIFO order).
  - `HistoryService.snapshot(manager, floorId, tick): Promise<void>` (saves `JSON.stringify(liveState)`).
  - `HistoryService.stateAt(manager, floorId, tick, currentTick): Promise<FloorState | null>`. `tick === currentTick` → `liveState`. Otherwise: S = the `tick_history` row with the highest `tick <= tick` (none → `null`). Replay the floor's entries with `S.tick < entry.tick <= tick`, in id order (`S.tick === tick` → no entries).
  - `EngineService.snapshotFrequency = 10`. At the start of `applyTick` (inside the tick's transaction), when `!scenarioMode && currentTick % snapshotFrequency === 0`, call `history.snapshot(manager, floorId, currentTick)`.
  - `EngineService.history(floorId, tick): Promise<{ ok: true; state: FloorState } | { ok: false; reason: string }>`. Runs under the lock. Unknown floor → `Floor <id> not found`. Tick not an int in `0..tickOf(floorId)` → `Tick must be an int from 0 to <currentTick>`. `stateAt` null → `No history for tick <n>`.
  - `GET /floors/:id/history?tick=N` → `FloorState`; ignored → 400 with the reason.

- [ ] **Step 1: Write the failing tests**
  - `engine.service.spec.ts`: `snapshots at the start of ticks 0, 10, 20 (snapshotFrequency 10), not 1–9`. `no snapshot in scenarioMode`. `a failed tick rolls its snapshot back`.
  - `history.service.spec.ts` (real in-memory DB via `sqliteTestDb`, Engine + History): **`stateAt(t) equals the live state recorded at each tick t from 0 to 25`**. The script places 3 robots, queues mixed commands, toggles obstacles between ticks, resizes so that a robot is displaced at tick 13, deletes a robot at tick 17, and records `liveState` after each step (Review Focus 1). Also: `stateAt(currentTick) is the live state, including commands since the last tick`. `stateAt with no snapshot ≤ tick returns null` (Review Focus 5).
  - `history.e2e-spec.ts`: `GET /floors/:id/history?tick=3 returns that tick's robots`; `tick above currentTick, negative or non-int → 400`; `unknown floor → 400 Floor <id> not found`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `HistoryService`, `HistoryModule` (imports `TypeOrmModule.forFeature([TickHistory, LogEntry, Floor, Cell, Robot, QueuedCommand])`, exports `HistoryService`), the Engine hook, and the route. `EngineModule` imports `HistoryModule`.
- [ ] **Step 4: Run** `npm run test -w apps/api && npm run test:e2e -w apps/api` → PASS.
- [ ] **Step 5: Commit checkpoint:** `feat(api): tick snapshots and history reads`.

### Task 6: Fork From Here

**Files:**
- Modify: `apps/api/src/history/history.service.ts`, `apps/api/src/engine/engine.service.ts`, `apps/api/src/floor/floor.controller.ts`
- Create: `apps/api/src/floor/dto/fork-floor.dto.ts`
- Test: `history.service.spec.ts`, `apps/api/test/history.e2e-spec.ts`

**Interfaces:**
- Consumes: `stateAt` (Task 5); `selectFloor` semantics (Task 3).
- Produces:
  - `HistoryService.fork(manager, floorId, tick, currentTick): Promise<number | null>` (the new floor id; null when `stateAt` is null). It inserts the new Floor, its cells, robots in ascending state `id` order with the same displayIds and directions, and each robot's queue in order. It copies the source's log entries with `entry.tick <= tick`, in id order, keeping their `tick`, with the new floor. It copies the `tick_history` rows with `tick <= tick`.
  - `EngineService.fork(floorId, tick): Promise<{ ok: true; floorId: number } | { ok: false; reason: string }>`: same validation and reasons as `history()`; runs under the lock in one transaction. Then it calls `setTick(newId, tick)` and selects the new floor, which stops running. No log entry.
  - `POST /floors/:id/fork { tick: int ≥ 0 }` (`ForkFloorDto`) → `{ floorId }`; ignored → 400.

- [ ] **Step 1: Write the failing tests**
  - `fork at tick 12 of 25: new floor's live state equals source stateAt(12), including queues`.
  - `fork's history: stateAt(t) on the fork equals stateAt(t) on the source for t = 0..12`.
  - `fork of a fork (fork at 12, step 5, fork that at 8): stateAt(0..8) matches the original floor` (Review Focus 3).
  - `fork leaves the source floor's cells, robots, log and snapshots unchanged`.
  - `fork selects the new floor at tick <t> and pauses the engine`.
  - `fork writes no log entry beyond the copies` (fork log length = source entries with `tick <= 12`).
  - e2e: `POST /floors/:id/fork { tick } → 200 { floorId }; GET /engine shows that floorId and currentTick = tick`; `tick > currentTick → 400`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit checkpoint:** `feat(api): fork a floor from a past tick`.

### Task 7: Per-floor Reset All, Delete Floor

**Files:**
- Modify: `apps/api/src/floor/floor.service.ts`, `floor.controller.ts`, `apps/api/src/engine/engine.service.ts`
- Test: `apps/api/src/floor/floor.service.spec.ts`, `apps/api/test/floor.e2e-spec.ts`, `apps/api/test/crud.e2e-spec.ts` (still asserts `DELETE /floors/1` → 404)

**Interfaces:**
- Produces:
  - `EngineService.reset(floorId)`: stop, wait for the in-flight tick, `setTick(floorId, 0)`.
  - `FloorService.reset(id)`: unchanged contract, except it deletes only `log_entry` and `tick_history` rows with that `floor_id`.
  - `EngineService.deleteFloor(floorId): Promise<CommandResult>`: unknown → ignored `Floor <id> not found`. Stops if running and waits for the in-flight tick. In one transaction under the lock, deletes queued commands → robots → cells → log entries → tick_history → floor, and drops it from the tick map. If no floor remains, it creates a default `DEFAULT_FLOOR_SIZE` floor through `direct.floor(null, …)` (which logs `FLOOR 5, 5, CREATED` on the new floor). Active = lowest remaining id.
  - `POST /floors/:id/delete` → `EngineState`; unknown → 404.

- [ ] **Step 1: Write the failing tests**
  - `reset clears only that floor's log entries and snapshots; another floor's are kept`.
  - `reset sets only that floor's tick to 0`.
  - `deleteFloor removes the floor's cells, robots, queues, log entries and snapshots; other floors are untouched`.
  - `deleteFloor of the active floor selects the lowest remaining id`.
  - `deleteFloor of the last floor creates a 5x5 Open floor and makes it active at tick 0`.
  - e2e: `POST /floors/:id/delete → 200; GET /floors no longer lists it`; `POST /floors/9999/delete → 404`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test -w apps/api && npm run test:e2e -w apps/api` → PASS.
- [ ] **Step 5: Commit checkpoint:** `feat(api): per-floor reset and delete floor`.

### Task 8: Web API service and models

**Files:**
- Modify: `apps/web/src/app/services/simulation-api.service.ts`, `simulation-api.service.spec.ts`, `models/engine-state.model.ts`
- Create: `apps/web/src/app/models/floor-state.model.ts`

**Interfaces:**
- Produces:
  - `EngineState.floorId: number | null`.
  - `FloorState` (same shape as the API's, with `Direction` / `CommandName`).
  - `getRobots(floorId: number)` → `GET /robots?floorId=`. `getLogEntries(floorId: number)` → `GET /log-entries?floorId=`.
  - `selectFloor(floorId): Observable<EngineState>` → `POST /engine/floor`.
  - `getFloorState(floorId, tick): Observable<FloorState>` → `GET /floors/:id/history?tick=`.
  - `forkFloor(floorId, tick): Observable<number>` → `POST /floors/:id/fork`, maps to `floorId`.
  - `deleteFloor(floorId): Observable<EngineState>` → `POST /floors/:id/delete`.
  - `toLoadedState(floorId, state: FloorState): { floor: Floor; cells: Cell[]; robots: Robot[]; queues: Map<number, QueuedCommand[]> }` (exported pure function). View-only cell ids are `y * width + x + 1`; robot `cellId` uses the same formula. Queue entries get ids `1..n` in order.

- [ ] **Step 1: Write the failing tests** (HttpTestingController): one per method above for the URL, method and body. `toLoadedState maps x/y to matching cell and robot cellIds and keeps queue order`.
- [ ] **Step 2: Run** `npm run test -w apps/web` → FAIL.
- [ ] **Step 3: Implement.** Fix the callers of `getRobots()` / `getLogEntries()` in later tasks; let the compile errors guide you.
- [ ] **Step 4: Run** → PASS (service spec).
- [ ] **Step 5: Commit checkpoint** together with Task 10, because the callers change there.

### Task 9: Timeline component

**Files:**
- Create: `apps/web/src/app/components/timeline/timeline.ts`, `timeline.html`, `timeline.spec.ts`

**Interfaces:**
- Produces: `selector: 'app-timeline'`. Inputs: `currentTick: number`, `floors: Floor[]`, `floorId: number | null`. Model: `viewTick = model<number | null>(null)` (null = live). Outputs: `forked: number` (the tick to fork from), `floorSelected: number`.
- Layout, left to right: range input (`aria-label="Tick"`, min 0, max `currentTick`, step 1, value `viewTick ?? currentTick`), a number input (`aria-label="Tick number"`, same value), an `app-button` labelled `Fork From Here`, and a `<select aria-label="Floor">` with one `<option>` per floor, `Floor <id>`, selected = `floorId`.
- Behavior: the range input's `input` event sets `viewTick` to `v >= currentTick ? null : v`. The number input's `input` event applies a whole number within range the same way. Its `change` event clamps (`Math.floor`, then `0..currentTick`) and applies; empty / NaN → reset the field to the shown value. Fork emits `viewTick ?? currentTick`. A select change emits `floorSelected(Number(value))`.

- [ ] **Step 1: Write the failing tests:**
  - `range has min 0 and max equal to currentTick, and follows currentTick while viewTick is null` (set currentTick 3 → 4; value 4).
  - `pinned: after moving to 2, a currentTick change keeps the value at 2` (Review Focus 4).
  - `moving back to max sets viewTick to null, and it follows again`.
  - `range input updates the number input and the number input updates the range`.
  - `number change: 7.8 → 7; 99 (currentTick 10) → 10 and live; -3 → 0; empty → shows the scrubber value, viewTick unchanged`.
  - `Fork From Here emits viewTick, or currentTick when live`.
  - `dropdown lists "Floor <id>" per floor, selects floorId, and emits floorSelected on change`.
- [ ] **Step 2: Run** `npm run test -w apps/web -- timeline` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit checkpoint:** `feat(web): timeline component`.

### Task 10: Grid — floor input, history view, read-only

**Files:**
- Modify: `apps/web/src/app/components/grid/grid.ts`, `grid.html`, `grid.spec.ts`; `apps/web/src/app/components/log-modal/log-modal.ts`, `log-modal.spec.ts`

**Interfaces:**
- Consumes: Task 8 methods, `toLoadedState`.
- Produces:
  - Grid inputs `floorId: number | null` and `viewTick: number | null`. Output `floorShown: Floor`, emitted on every live `show()`. Output `historyShown: void`.
  - `historyQueue(robotId: number): QueuedCommand[]` (empty when live or unknown).
  - Read-only = `viewTick() !== null`. In read-only, cell clicks send nothing, the size sliders are `disabled`, robot clicks still emit, and tick changes do not reload robots.
  - On init, after loading the floors, the Grid shows the floor whose id is `floorId()`, or `floors[0]`. When `floorId` changes to an id other than the shown one, it loads that floor live. `currentFloor()` finds the shown id in `GET /floors`. When `viewTick` becomes non-null, `getFloorState` → `toLoadedState` → show (switchMap, so a newer tick cancels an older one), then `historyShown`. When it goes back to null, the Grid reloads the live floor.
  - `LogModal` input `floorId: number` → `getLogEntries(floorId)`.

- [ ] **Step 1: Write the failing tests** (`grid.spec.ts`):
  - `init shows the floor matching floorId when it is not the first`.
  - `floorId change loads that floor's cells and robots`.
  - `viewTick 5 requests getFloorState(floorId, 5) and renders its cells, obstacles and robots`.
  - `read-only: cell click in edit mode and in place mode sends nothing; sliders are disabled`.
  - `read-only: robot click still emits robotClicked`.
  - `read-only: a tick change does not reload robots`.
  - `viewTick back to null reloads the live floor`.
  - `historyQueue returns the robot's queue at that tick`.
  - `log-modal.spec.ts`: `requests the log for the given floorId`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test -w apps/web` → the grid, log-modal and service specs PASS.
- [ ] **Step 5: Commit checkpoint:** `feat(web): grid floor selection and read-only history view` (includes Task 8).

### Task 11: App wiring

**Files:**
- Modify: `apps/web/src/app/app.ts`, `app.html`, `app.css`, `app.spec.ts`

**Interfaces:**
- Consumes: Timeline (Task 9), Grid inputs/outputs (Task 10), API methods (Task 8).
- Produces:
  - App signals `floorId`, `floors`, `viewTick`, and `readOnly = computed(() => viewTick() !== null)`.
  - `applyEngineState` also sets `floorId`.
  - `onFloorShown(floor)` sets `floorId` when it is null and refreshes `floors` (`GET /floors`).
  - Layout: new area `timeline` directly under `grid` (wide: `'timeline .'`, narrow: `'timeline'`), above `errors`.
  - Top bar: `Delete Floor` after `Reset All`.
  - Disabled while read-only: Step (`running() || readOnly()`), Play (`!running() && readOnly()`), Edit, Turn Left / Turn Right / Move / Delete, Reset All, Delete Floor. Arrow keys do nothing.
  - `onViewTickChange(v)`: when live, reload the selected robot's queue from the API. On `historyShown`, set `queue` from `grid().historyQueue(selected)`.
  - `onFork(tick)` → `forkFloor(floorId, tick)` → refresh engine and floors; clear the selection; `viewTick` null. Failure → `Floor failed to fork.`
  - `onFloorSelected(id)` → `selectFloor(id)` → `applyEngineState`; clear the selection and queue; `viewTick` null. Failure → `QUEUE_LOAD_ERROR` text.
  - `onDeleteFloor()`: `window.confirm('Delete this floor?')`. No → nothing. Yes → `deleteFloor(floorId)` → `applyEngineState`, refresh floors, clear the selection, `viewTick` null. Failure → `Floor failed to delete.`
  - Reset All also sets `viewTick` null. The Log modal gets `[floorId]`.

- [ ] **Step 1: Write the failing tests** (`app.spec.ts`):
  - `timeline renders below the grid and above the errors`.
  - `Delete Floor sits right after Reset All`.
  - `read-only disables Step, Play, Edit, Turn Left, Turn Right, Move, Delete, Reset All, Delete Floor; Pause stays enabled while running; arrow keys send nothing`.
  - `read-only keeps the scrubber, Fork, dropdown, Log and robot selection enabled`.
  - `scrubbing while running: a new currentTick from polling keeps the pinned viewTick` (Review Focus 4).
  - `Fork sends the scrubber's tick, then shows the new floor live`.
  - `Fork failure shows Floor failed to fork.`
  - `dropdown change calls selectFloor, shows Play, and clears the selection`.
  - `Delete Floor: No → nothing sent; Yes → deleteFloor, floors refresh, selection clears; failure → Floor failed to delete.`
  - `Reset All resets only the viewed floor id`.
  - `history view shows the selected robot's queue at that tick`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test -w apps/web` → PASS.
- [ ] **Step 5: Commit checkpoint:** `feat(web): timeline, fork, floor dropdown, delete floor`.

### Task 12: Full verification

- [ ] **Step 1:** Run `npm run lint && npm run test && npm run test:e2e -w apps/api && npm run build` → all pass, with no lint errors.
- [ ] **Step 2:** Run each `npm run -s scenario -- scenario-N.txt` (1–5) → matches `scenarios/expected/` after normalizing CRLF and the trailing newline.
- [ ] **Step 3:** Run the app (`npm run dev:api`, `npm run dev:web`). Play to tick 25, scrub to 13 (read-only, robots as they were), type 7.5 (→ 7), fork, confirm the new floor is at tick 7 and editable, switch back with the dropdown, then Delete Floor on the fork.
- [ ] **Step 4:** Append the `AI_USAGE.md` entry (≤500 chars). Ask the user about the final commit.
