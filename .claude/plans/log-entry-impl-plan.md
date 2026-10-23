# LogEntry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the web's state changes through the Engine's commands, have the Engine log each successful command and every tick, and show the log in the Log modal.

**Architecture:** New `POST /commands/{floor,obstacle,place,queue,delete}` routes (DTO-validated) call `EngineService`. `DirectCommandsService` applies each command and, on success, returns the log line (action + params text). `EngineService` writes that line through `LogEntryService` unless `scenarioMode` is `true`. `step()` logs its own TICK line. The web switches from the CRUD write routes to these routes and refetches the affected state after a success.

**Tech Stack:** NestJS, TypeORM + SQLite, class-validator, Angular 22 (standalone, signals), Vitest.

**Spec:** `.claude/plans/log-entry-plan.md` (source) and `.claude/rules/log-entry.md`, `commands.md`, `engine.md` (Task 1 updates the rules to match).

## Decisions (from user, 2026-10-22)
- The web routes **floor create/resize, obstacle toggle, robot place, robot move, enqueue and robot delete** through Engine commands. The Engine logs each one.
- **OBSTACLE toggles** the cell (Open ↔ Obstacle). This changes the command for scenarios too. Toggling ON a cell with a robot → ignored.
- **PLACE without `rId`** → the Engine queries the DB for the highest `displayId` and uses it + 1 (1 if there are no robots).
- **Move selected robot (new UI):** edit mode off, robot selected, click an empty Open cell → PLACE with that robot's `rId`, the new x/y, and its current direction. With no robot selected, the click places a new robot facing NORTH, as today.
- **New Engine DELETE** command (`POST /commands/delete { rId }`), logged as `DELETE R1`.
- `scenarioMode === true` skips every log write (commands and ticks).
- TICK `result` = report lines joined with `\n` (`EMPTY` with no robots). Modal line: `${action} ${params}: ${result}`, with `whitespace-pre-line`.
- **Planner's choices, flagged for review:**
  - Command routes return `200 { ok: true }`. Ignored commands return `400` with the reason (commands.md). After a success, the web refetches what changed (floor + cells, cells, robots, or the queue) instead of reading it from the response.
  - Only these 5 routes are built. LEFT/RIGHT/MOVE/TICK/REPORT routes are not needed now; the web enqueues through `/commands/queue` with one command.
  - The CRUD write routes stay as they are and write no log entries. Reset (`POST /floors/:id/reset`) still clears the log and writes nothing. Web methods that become unused are removed.
  - The web `Robot` model gains `displayId`, and the robot shows `R{{ displayId }}` (robot-rules.md already requires this). It's needed because commands address robots by `rId`.

## Global Constraints
- `rId` = uppercase `R` + int, parsed as `displayId`. `r3`, `3`, `R`, `Rx` → 400 (commands.md).
- Directions over HTTP: `NORTH` | `EAST` | `SOUTH` | `WEST` (uppercase) → `Direction` 0–3.
- Params text, exact:
  - PLACE `R1 2, 3, NORTH`
  - OBSTACLE `2, 3, ON` / `2, 3, OFF`
  - QUEUE `R1 MOVE` (several commands: `R1 MOVE LEFT`)
  - DELETE `R1`
  - FLOOR `5, 5, CREATED` / `5, 5, RESIZED`
  - TICK: the tick number, e.g. `3`
- `result` is `OK`, except TICK. Report line format is unchanged (`formatReport`): `R1 2,3,NORTH`, sorted by `displayId`.
- Ignored commands write no entry. `GET /log-entries` returns entries by ascending `id`.
- No migrations needed.
- TypeScript strict; ESLint + Prettier pass; kebab-case files; controllers do HTTP only.
- **No commits** without asking the user. Add a short `AI_USAGE.md` entry (≤500 chars) at the end.

## Review Focus
1. **Ignored command** (obstacle ON a robot's cell, place on an Obstacle or occupied cell, unknown `rId`, resize with no room) → 400, no entry, nothing changed, and the web shows its existing error. Tests: Tasks 3, 5, 7.
2. **displayId gaps:** robots R1, R3 exist (R2 deleted) → a new robot is R4. With no robots → R1. Test: Task 3.
3. **Move onto the robot's own cell, or into an Obstacle/occupied cell** → own cell is OK (logs PLACE), the others are ignored. Tests: Task 3 (Engine), Task 7 (web sends nothing for Obstacle/occupied).
4. **Scenario run** → no entries, though commands and ticks run; scenario outputs still match `scenarios/expected/`. Tests: Task 5.
5. **Play while the user acts** → TICK and command entries interleave in write order, and the modal shows them in `id` order. Tests: Task 5 (order), Task 8 (render).

---

### Task 1: Update rules files

**Files:** `.claude/rules/commands.md`, `log-entry.md`, `engine.md`, `robot-rules.md`, `edit-mode.md`, `floor-grid.md`, `scenario-runner.md`

- [ ] **Step 1:** `commands.md`:
  - OBSTACLE toggles; ON a cell with a robot → ignored.
  - PLACE: `rId` is optional; without it, `displayId` = DB max + 1 (or 1).
  - Add DELETE (`POST /commands/delete { rId }`): removes the robot and its queue; unknown robot → ignored.
  - Success → `200 { ok: true }`.
  - Note that only floor/obstacle/place/queue/delete routes exist so far.
  - Update the Testing lines to match.
- [ ] **Step 2:** `log-entry.md`:
  - Replace "logged in the HTTP controllers only" with: the Engine logs every successful command it executes (FLOOR, OBSTACLE, PLACE, QUEUE, DELETE) and each tick.
  - `scenarioMode` skips all writes.
  - TICK result is joined with `\n`; the modal line is `${action} ${params}: ${result}`.
  - CRUD routes don't log.
  - Update Testing.
- [ ] **Step 3:** `engine.md`: add `delete(displayId)` and `log()` (a no-op when `scenarioMode` is set). Commands log on success.
- [ ] **Step 4:** Web rules:
  - `robot-rules.md`: Placement, Move-selected-robot, Delete and Commands now use `POST /commands/place|delete|queue`; refetch after success; `R{{displayId}}`.
  - `edit-mode.md`: `POST /commands/obstacle { x, y }`.
  - `floor-grid.md`: create and resize via `POST /commands/floor`; a resize with no room → 400 → the existing resize error.
  - `scenario-runner.md`: OBSTACLE toggles.
  - Update each Testing section.

### Task 2: Log params formatters

**Files:** Create `apps/api/src/log-entry/log-params.ts`; Test `apps/api/src/log-entry/log-params.spec.ts`

**Produces:**
```ts
export type LogAction = 'PLACE' | 'OBSTACLE' | 'QUEUE' | 'DELETE' | 'FLOOR' | 'TICK';
export interface LogLine { action: LogAction; params: string }
export function placeParams(displayId: number, x: number, y: number, direction: Direction): string;
export function obstacleParams(x: number, y: number, on: boolean): string;
export function queueParams(displayId: number, commands: Command[]): string;
export function deleteParams(displayId: number): string;
export function floorParams(width: number, height: number, change: 'CREATED' | 'RESIZED'): string;
```

- [ ] **Step 1: Failing tests**
```ts
expect(placeParams(1, 2, 3, Direction.N)).toBe('R1 2, 3, NORTH');
expect(placeParams(4, 0, 0, Direction.W)).toBe('R4 0, 0, WEST');
expect(obstacleParams(2, 3, true)).toBe('2, 3, ON');
expect(obstacleParams(2, 3, false)).toBe('2, 3, OFF');
expect(queueParams(1, ['MOVE'])).toBe('R1 MOVE');
expect(queueParams(1, ['MOVE', 'LEFT'])).toBe('R1 MOVE LEFT');
expect(deleteParams(7)).toBe('R7');
expect(floorParams(5, 5, 'CREATED')).toBe('5, 5, CREATED');
expect(floorParams(8, 3, 'RESIZED')).toBe('8, 3, RESIZED');
```
- [ ] **Step 2:** `npm run test -w apps/api -- log-params` → FAIL.
- [ ] **Step 3:** Implement with `DIRECTION_NAMES`.
- [ ] **Step 4:** Same command → PASS. Ask whether to commit.

### Task 3: DirectCommandsService — toggle, auto displayId, delete, log lines

**Files:** Modify `apps/api/src/engine/command-result.ts`, `apps/api/src/engine/direct-commands.service.ts`; Test `direct-commands.service.spec.ts` (+ `engine.service.spec.ts` / `run-scenario.spec.ts`, wherever `{ ok: true }` is compared exactly)

**Interfaces:**
- `CommandResult = { ok: true; log?: LogLine } | { ok: false; reason: string }`
- `place(displayId: number | undefined, x, y, direction)`
- `delete(displayId: number): Promise<CommandResult>`
- On success, `floor/obstacle/place/queue/delete` return `{ ok: true, log: { action, params } }`.

- [ ] **Step 1: Failing tests** (use the spec's existing sqlite-backed setup)
  - `floor(5,5)` with no floor → `log: { action: 'FLOOR', params: '5, 5, CREATED' }`. Then `floor(8,5)` → `'8, 5, RESIZED'`. A resize with no room → `{ ok: false }`.
  - `obstacle(2,3)` → the cell becomes an Obstacle, `log.params === '2, 3, ON'`. Again → Open, `'2, 3, OFF'`. ON a robot's cell → ignored, cell unchanged.
  - `place(undefined, 2, 3, N)` with no robots → `displayId` 1, `'R1 2, 3, NORTH'`. With R1 and R3 → creates R4.
  - `place(1, 4, 0, E)` on existing R1 → moved and turned, `'R1 4, 0, EAST'`. `place(1, <own x,y>, N)` → ok.
  - `queue(1, ['MOVE','LEFT'])` → `log: { action: 'QUEUE', params: 'R1 MOVE LEFT' }`.
  - `delete(1)` → robot and its queued commands gone, `'R1'`. `delete(9)` → `{ ok: false, reason: 'Robot R9 not found' }`.
- [ ] **Step 2:** `npm run test -w apps/api -- direct-commands` → FAIL.
- [ ] **Step 3:** Implement.
  - Max `displayId`: `manager.getRepository(Robot).maximum('displayId')` inside the write transaction (`?? 0` + 1).
  - `delete` runs under `write()`: delete QueuedCommands by robot, then the robot.
  - OBSTACLE reads the current value and saves `!obstacle`.
- [ ] **Step 4:** `npm run test -w apps/api` → PASS. Run all 5 scenarios (`npm run -s scenario -- scenarios/<file>`) and diff against `scenarios/expected/`. If a toggle changes an expected output, stop and tell the user.
- [ ] **Step 5:** Ask whether to commit.

### Task 4: EngineService — `log()`, logged commands, `delete()`, TICK

**Files:** Modify `engine.service.ts`, `engine.module.ts` (import `LogEntryModule`); `log-entry.module.ts` (`exports: [LogEntryService]`); `log-entry.service.ts` (`findAll` → `order: { id: 'ASC' }`). Test: `engine.service.spec.ts`, `log-entry.service.spec.ts`

**Interfaces:**
- Constructor gains a 5th param, `logEntries: LogEntryService`.
- `log(action: LogAction, params: string, result = 'OK'): Promise<void>` — no-op when `scenarioMode` is set.
- `place(displayId: number | undefined, …)`.
- `delete(displayId: number): Promise<CommandResult>`.
- `floor/obstacle/place/queue/delete` return the direct result unchanged, after logging `result.log` when `ok`.

- [ ] **Step 1: Failing tests** (mock `logEntries.create`)
  - `place` resolving `{ ok: true, log: { action: 'PLACE', params: 'R1 2, 3, NORTH' } }` → `create({ action: 'PLACE', params: 'R1 2, 3, NORTH', result: 'OK' })`. Same for floor/obstacle/queue/delete (one test each).
  - Direct result `{ ok: false }` → no `create`.
  - `scenarioMode = true` → no `create`, for both commands and `step()`.
  - `step()` with report `['R1 0,1,NORTH','R2 3,3,EAST']` → `create({ action: 'TICK', params: '1', result: 'R1 0,1,NORTH\nR2 3,3,EAST' })`. A second step → `params: '2'`. Report `['EMPTY']` → `'EMPTY'`. Written after `moveAll`.
  - `findAll` orders by `id` ASC.
- [ ] **Step 2:** `npm run test -w apps/api -- engine.service log-entry.service` → FAIL.
- [ ] **Step 3:** Implement.
  - Use a private helper that awaits the direct call and logs `result.log` if `ok`.
  - In `applyTick()`, after `moveAll`: `await this.log('TICK', String(this.currentTick), (await this.direct.report()).join('\n'))`. This runs under the lock.
- [ ] **Step 4:** `npm run test -w apps/api` → PASS. Ask whether to commit.

### Task 5: Command routes + e2e

**Files:**
- Create `apps/api/src/engine/commands.controller.ts`.
- Create `apps/api/src/engine/dto/` with `floor-command.dto.ts`, `obstacle-command.dto.ts`, `place-command.dto.ts`, `queue-command.dto.ts`, `delete-command.dto.ts`.
- Register the controller in `engine.module.ts`.
- Tests: `commands.controller.spec.ts`, DTO specs, new `apps/api/test/commands.e2e-spec.ts`; modify `apps/api/test/scenario.e2e-spec.ts`.

**Interfaces:**
- `@Controller('commands')`, every route `@HttpCode(200)`.
- `floor({ width = 5, height = 5 })`, `obstacle({ x, y })`, `place({ rId?, x, y, direction })`, `queue({ rId, commands })`, `delete({ rId })`.
- `rId` is validated by `@Matches(/^R\d+$/)` and parsed with `Number(rId.slice(1))`. `direction` is `@IsIn(DIRECTION_NAMES)` → index.
- `{ ok: false }` → `throw new BadRequestException(reason)`. `{ ok: true }` → `{ ok: true }`.

- [ ] **Step 1: Failing tests**
  - Controller: each route calls the matching Engine method with parsed args (`'R3'` → 3, `'EAST'` → 1, place without `rId` → `undefined`); ignored → 400 with the reason.
  - DTOs: `r3`, `3`, `R`, `Rx` rejected; `east` rejected; empty `commands` and lowercase commands rejected.
  - e2e, over HTTP:
    1. POST `/commands/floor {}`
    2. place `{ x:2, y:3, direction:'NORTH' }`
    3. obstacle `{ x:0, y:0 }`
    4. queue `{ rId:'R1', commands:['MOVE'] }`
    5. POST `/engine/step`
    6. delete `{ rId:'R1' }`
    7. POST `/engine/step`
    8. `GET /log-entries` `[action, params, result]` in order equals: `FLOOR 5, 5, CREATED OK`, `PLACE R1 2, 3, NORTH OK`, `OBSTACLE 0, 0, ON OK`, `QUEUE R1 MOVE OK`, `TICK 1 R1 2,4,NORTH`, `DELETE R1 OK`, `TICK 2 EMPTY`.
  - e2e: obstacle ON a robot's cell → 400, and no new entry. POST `/floors/:id/reset` → `GET /log-entries` is `[]`.
  - scenario e2e: after a run with ticks, `log_entry` is empty.
- [ ] **Step 2:** `npm run test -w apps/api` and `npm run test:e2e -w apps/api` → FAIL, then implement → PASS.
- [ ] **Step 3:** Ask whether to commit.

### Task 6: Web API service + Robot displayId

**Files:**
- Modify `apps/web/src/app/services/simulation-api.service.ts` (+ spec), `models/robot.model.ts`, `components/robot/robot.html` (+ spec).

**Produces** (`ok` responses are `Observable<void>`):
```ts
floorCommand(size: FloorSize): Observable<void>;            // POST /commands/floor
obstacleCommand(x: number, y: number): Observable<void>;    // POST /commands/obstacle
placeCommand(x: number, y: number, direction: Direction, displayId?: number): Observable<void>;
  // POST /commands/place { x, y, direction: 'NORTH'|…, rId?: 'R<n>' } (omit rId when undefined)
queueCommand(displayId: number, command: CommandName): Observable<void>;  // { rId, commands: [command] }
deleteCommand(displayId: number): Observable<void>;         // POST /commands/delete { rId }
getLogEntries(): Observable<LogEntry[]>;                    // GET /log-entries
```
- `Robot` gains `displayId: number`, mapped from the API's `displayId`.
- Remove `createFloor`, `updateFloor`, `updateCell`, `createRobot`, `deleteRobot`, `createQueuedCommand` once Tasks 7–8 stop using them (do the removal in Task 8).

- [ ] **Step 1: Failing tests:**
  - Each method → one request with the exact URL, method and body, e.g. `placeCommand(2, 3, Direction.North)` → body `{ x: 2, y: 3, direction: 'NORTH' }`; with `displayId` 4 → `rId: 'R4'`.
  - `getRobots` maps `displayId`.
  - The robot renders `R12` from `displayId: 12` (with `id: 5`).
- [ ] **Step 2:** `npm run test -w apps/web` → FAIL. Implement → PASS. Ask whether to commit.

### Task 7: Grid — floor, obstacle, place, move via commands

**Files:** Modify `apps/web/src/app/components/grid/grid.ts` (+ `grid.spec.ts`)

**Consumes:** Task 6 methods. `selectedRobotId` input (robot `id`) already exists.

- [ ] **Step 1: Failing tests**
  - Init with empty `GET /floors` → `floorCommand({ width: 5, height: 5 })`, then `getFloors` again and render 5×5.
  - Slider `change` → `floorCommand(size)`, then refetch floor + cells. A 400 → sliders resync and the existing resize error shows. Other errors → `Server can't be reached`.
  - Edit mode, cell (2,3) click → `obstacleCommand(2, 3)`. On success the cell flips locally. On error it is unchanged.
  - Edit off, nothing selected, empty Open cell → `placeCommand(x, y, North)` (no displayId), then `getRobots()` and render. On error → `Robot failed to place.`
  - Edit off, robot (displayId 3, facing EAST) selected, empty Open cell → `placeCommand(x, y, East, 3)`, then `getRobots()`. The robot shows on the new cell, still selected. On error → `Robot failed to place.`
  - Obstacle or occupied cell → no request (both cases).
- [ ] **Step 2:** `npm run test -w apps/web` → FAIL. Implement (keep the `switchMap`/`takeUntil(resets)` structure for resize) → PASS. Ask whether to commit.

### Task 8: App + Log modal

**Files:** Modify `apps/web/src/app/app.ts` (+ `app.spec.ts`), `components/log-modal/log-modal.ts`, `log-modal.html` (+ spec); remove now-unused API methods and their specs.

- [ ] **Step 1: Failing tests**
  - Move/Left/Right buttons and arrow keys → `queueCommand(selected displayId, 'MOVE'|'LEFT'|'RIGHT')`, then `getQueuedCommands(id)` refreshes the panel. On failure → the panel is unchanged and `Command failed to queue.` shows.
  - Delete → `deleteCommand(displayId)`. Success, the failure message, and selection-switch behavior stay as today.
  - LogModal (stub `getLogEntries`):
    - `getLogEntries` is called once on create.
    - Entries `PLACE/R1 2, 3, NORTH/OK` and `TICK/1/'R1 2,4,NORTH\nR2 0,0,EAST'` render as `li` texts `PLACE R1 2, 3, NORTH: OK` and `TICK 1: R1 2,4,NORTH\nR2 0,0,EAST`, in order, each `whitespace-pre-line`.
    - A fetch error → no `li`, no throw, and the dialog stays open.
  - The close button's text is `X`. It has `cursor-pointer` and the `app-button` classes `rounded border-2 border-[#1971c2] bg-[#a5d8ff] text-[#1971c2] hover:brightness-95`. Clicking it emits `closed`.
  - App: opening Log twice → `getLogEntries` is called twice.
- [ ] **Step 2:** `npm run test -w apps/web` → FAIL. Implement.
  - LogModal: `inject(SimulationApiService)`, an `entries` signal, and the fetch in the constructor (the modal is re-created on each open).
  - Template: `<ol>` of `<li class="whitespace-pre-line">{{ e.action }} {{ e.params }}: {{ e.result }}</li>`, tracked by `e.id`.
  - Remove the "TBD" comment in `onOpenLog`.
  - Make the test pass.
- [ ] **Step 3:** From the repo root run `npm run lint`, `npm run build`, `npm run test`, `npm run test:e2e -w apps/api` → all pass. Add the `AI_USAGE.md` entry. Ask whether to commit.
