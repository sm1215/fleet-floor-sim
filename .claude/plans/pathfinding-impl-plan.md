# GOTO Pathfinding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `GOTO x,y` robot command. It stays at the head of the robot's queue, and on each tick it faces the robot (free turn) along a shortest path and makes a normal MOVE. Users issue it from the UI with Shift+Click.

**Architecture:** A pure BFS function in a new `apps/api/src/pathfinding/` folder picks the first step. The Queue returns a GOTO head without deleting it. The Engine runs GOTOs inside `applyTick`: it turns the robot for free, adds the robot to the tick's `moveAll`, removes the GOTO when the robot arrives or gives up, and keeps the no-path streak in memory. The web sends `POST /commands/goto` when the user Shift+Clicks a cell.

**Tech Stack:** NestJS + TypeORM (SQLite), Angular standalone components, Vitest.

**Spec:** `.claude/plans/pathfinding-plan.md`, plus the user's answers below.

## Decisions (user answers, 2026-10-22)

- No-path counter: kept **in memory in the Engine**, keyed by queued-command id. No schema change. An API restart resets it.
- API: new route `POST /commands/goto { rId, x, y }`. It is logged as action `QUEUE`, params `R1 GOTO 3,4`. `QUEUE` still accepts only `LEFT`/`RIGHT`/`MOVE`.
- Scenario runner: **no** GOTO support. A `GOTO` line stays an unknown keyword and is skipped.
- Component: a new pure module `apps/api/src/pathfinding/` with its own rules file `.claude/rules/pathfinding.md`.
- Give-up: the GOTO is dropped on the **3rd** no-path tick in a row, and `UNREACHABLE` is logged on that tick. A tick that has a path resets the count.
- Already on the target when the GOTO reaches the head: the GOTO finishes that tick and the robot does not move.
- Shift+Click issues a GOTO **only when Edit mode is off**. In Edit mode, Shift+Click behaves like a normal click.
- UNREACHABLE entry: action `UNREACHABLE`, params `R1 3, 4`, result `OK`. It is written in the tick's transaction before the `TICK` entry, and skipped in `scenarioMode`.

## Global Constraints

- Ask before committing, installing packages, or changing config files (CLAUDE.md). No per-task commits. Commit only when the user asks, on `main`.
- No new DB fields or migrations. GOTO is stored as `QueuedCommand { command: 'GOTO', params: 'x,y' }`.
- Direction ints: 0 = N, 1 = E, 2 = S, 3 = W. Origin is bottom-left, N = +y.
- Tie-break order for equal first steps: NORTH, EAST, SOUTH, WEST.
- Walls are: outside the grid, Obstacle cells, and every other robot's cell (positions at the start of the tick).
- Hint copy, verbatim: `Shift + Click an empty cell to issue a GOTO command`.
- Error copy for a failed GOTO request: the existing `COMMAND_ERROR` (`Command failed to queue.`).
- Invalid input never throws from the Engine. It returns `{ ok: false, reason }` (400 over HTTP).
- Code must pass `npm run lint` and Prettier. Use kebab-case file names.
- Add a 500-char-max entry to `AI_USAGE.md` for implementation decisions.

## Review Focus

1. **Tick rollback:** a tick that fails after GOTO work must not change the no-path counter, and must not delete the GOTO. Build the counter map during the tick and assign it only after the commit (test in Task 5).
2. **Same tick, a GOTO and a plain MOVE target the same cell:** the GOTO robot's MOVE follows the normal rules (the lower displayId wins). If the GOTO robot is blocked, the GOTO stays, and the no-path count resets because a path existed (test in Task 5).
3. **Target is an Obstacle or holds another robot:** no path, so the robot waits, and UNREACHABLE fires on the 3rd tick (test in Task 5).
4. **The robot is deleted while its GOTO is pending:** its queue is deleted with it. The counter map is rebuilt every tick from the GOTOs that tick sees, so no stale entry survives (test in Task 5).
5. **Shift+Click on an occupied/Obstacle cell, or with no robot selected:** no GOTO request. With no selection, Shift+Click places a robot like a normal click. With a selection, a Shift+Click never moves the robot by PLACE (tests in Task 7).

---

### Task 1: Rules files

**Files:**
- Create: `.claude/rules/pathfinding.md`
- Modify: `.claude/rules/commands.md`, `.claude/rules/queue.md`, `.claude/rules/engine.md`, `.claude/rules/log-entry.md`, `.claude/rules/robot-rules.md`, `CLAUDE.md` (Rules files list + folder structure)

- [ ] **Step 1: Create `pathfinding.md`** with frontmatter `paths: ["apps/api/src/pathfinding/**", "apps/api/src/engine/**"]`. It covers the GOTO behavior from the spec and the Decisions above. Location: `apps/api/src/pathfinding/find-first-step.ts`, a pure function with no DB or Nest. Algorithm: BFS over the grid, with walls as defined in Global Constraints, the robot's own cell open, and the N/E/S/W tie-break. Return value: no path → `null`. Engine behavior per tick: arrive/finish, face + MOVE, wait, and give up on the 3rd tick with UNREACHABLE. Counter: kept in memory, committed only with the tick. End with a Testing section that lists the specs from Tasks 2 and 5.
- [ ] **Step 2: Update the other rules.** Each must end up consistent with the plan:
  - `commands.md`: add the `GOTO` row (`POST /commands/goto`, `rId`, `x` int, `y` int) to the table and to the "routes that exist" line. Add a `## GOTO` section: it enqueues `GOTO` with params `x,y`, and unknown robot / non-int x,y / no cell at x,y → ignored. An Obstacle or occupied target is still enqueued. Under Tick execution, add a GOTO step that points to `pathfinding.md`.
  - `queue.md`: a `GOTO` head is parsed (params `x,y`) and **not deleted**. A GOTO with unparseable params is deleted and resolves to `null`. The Engine removes a GOTO through `QueueService.remove(id, manager)`. Add the matching Testing bullets.
  - `engine.md`: under `step()`, GOTO heads are planned before moves and join `moveAll`, and the no-path counter is in memory and committed with the tick. `reset()` clears the counter.
  - `log-entry.md`: add an `UNREACHABLE` row (params `R1 3, 4`), and note that the GOTO QUEUE params look like `R1 GOTO 3,4`. Add the Testing bullets.
  - `robot-rules.md`: add a `## GOTO (Shift+Click)` section that matches Task 7, plus its Testing bullets. Under Queue panel, GOTO shows as `GOTO 3,4`.
  - `scenario-runner.md`: no change (a `GOTO` line is already an unknown keyword).

---

### Task 2: Pathfinding module

**Files:**
- Create: `apps/api/src/pathfinding/find-first-step.ts`
- Test: `apps/api/src/pathfinding/find-first-step.spec.ts`

**Interfaces:**
- Produces: `findFirstStep(start: Position, target: Position, floor: { width: number; height: number }, isWall: (p: Position) => boolean): Direction | null`, which returns the direction of the first step of a shortest path. It returns `null` when there is no path or `start` equals `target`. Cells outside the grid are walls without asking `isWall`. `start` is never treated as a wall.

- [ ] **Step 1: Write failing tests** (5x5, no walls unless stated):
  - `(0,0)→(0,3)` → `Direction.N`. `(0,0)→(3,0)` → `Direction.E`. `(2,4)→(2,0)` → `Direction.S`. `(4,0)→(0,0)` → `Direction.W`.
  - Tie: `(0,0)→(2,2)` → `N`. `(2,2)→(4,0)` (E and S tie) → `E`. `(2,2)→(0,0)` (S and W tie) → `S`.
  - A detour around an obstacle wall at `(1,0),(1,1),(1,2),(1,3)` from `(0,0)→(2,0)` → `N`.
  - The shortest path beats the tie order: from `(2,1)` to `(2,4)` with `(2,2)` a wall, N is blocked. E and W both take 5 steps → assert `E`.
  - The only open route: from `(0,1)` to `(2,1)` with `(1,1)` and `(0,2)` walls → `S`.
  - Target is a wall → `null`. Target fully enclosed → `null`. Target outside the grid → `null`.
  - `start === target` → `null`.
  - `isWall` is never called for out-of-bounds positions (a spy asserts no call with x/y < 0 or ≥ size).
- [ ] **Step 2: Run** `npm run test -w apps/api -- src/pathfinding`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement.** BFS outward from `target` (only if it is in bounds and not a wall), which builds a distance map over open cells. Then check `start`'s neighbors in N, E, S, W order and return the first one with the minimum distance. Reuse a direction → offset table the same way as `FORWARD` in `resolve-moves.ts`. Export a shared `FORWARD` only if both files would otherwise duplicate it. If so, move it to `shared/types.ts` and import it in both.
- [ ] **Step 4: Run** the same command. Expected: PASS.

---

### Task 3: Queue keeps GOTO at the head

**Files:**
- Modify: `apps/api/src/shared/types.ts`, `apps/api/src/queue/next-command.ts`, `apps/api/src/queue/queue.service.ts`
- Test: `apps/api/src/queue/queue.service.spec.ts`

**Interfaces:**
- Produces in `types.ts`: `export const GOTO = 'GOTO'` and `export type QueueItemName = Command | typeof GOTO`. `COMMANDS` stays unchanged.
- Produces in `next-command.ts`:
  ```ts
  export type NextCommand =
    | { robot: Robot; command: Command }
    | { robot: Robot; command: typeof GOTO; queuedCommandId: number; target: Position };
  ```
- Produces in `QueueService`: `remove(queuedCommandId: number, manager: EntityManager): Promise<void>`.
- Produces: `parseGotoParams(params: string | null): Position | null`, which accepts `^\d+,\d+$` only. Export it from `queue.service.ts`.

- [ ] **Step 1: Write failing tests:**
  - A `GOTO` head with params `3,4` resolves to `{ command: 'GOTO', target: {x:3,y:4}, queuedCommandId }`. The row **still exists** after `doNext`, and a second `doNext` returns the same GOTO.
  - Commands queued behind a GOTO are not returned.
  - A GOTO with params `null`, `'3'`, or `'a,b'` resolves to `null` and is deleted.
  - `remove(id, manager)` deletes that row only.
- [ ] **Step 2: Run** `npm run test -w apps/api -- src/queue`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `takeNext`, when `head.command === 'GOTO'`: parse the params. If they are valid, return the GOTO without deleting it. Otherwise delete it and return `null`. Every other command keeps the current delete-then-parse path. Update the `doNext` JSDoc.
- [ ] **Step 4: Run** the same command, then all API tests (`npm run test -w apps/api`). Expected: PASS. `engine.service.ts` must still compile: narrow on `command` where `NextCommand` is used.

---

### Task 4: Enqueue GOTO (Engine method, route, log params)

**Files:**
- Modify: `apps/api/src/log-entry/log-params.ts`, `apps/api/src/engine/direct-commands.service.ts`, `apps/api/src/engine/engine.service.ts`, `apps/api/src/engine/commands.controller.ts`
- Create: `apps/api/src/engine/dto/goto-command.dto.ts`
- Test: `log-params.spec.ts`, `direct-commands.service.spec.ts`, `commands.controller.spec.ts`, `apps/api/test/commands.e2e-spec.ts`

**Interfaces:**
- Produces: `LogAction` gains `'UNREACHABLE'`. Add `gotoParams(displayId, x, y)` → `'R1 GOTO 3,4'` and `unreachableParams(displayId, x, y)` → `'R1 3, 4'`.
- Produces: `DirectCommandsService.goto(displayId: number, x: number, y: number, record?: Recorder): Promise<CommandResult>` and `EngineService.goto(displayId, x, y): Promise<CommandResult>` (it passes `this.record`, like `queue`).
- Produces: `GotoCommandDto { rId (RID_PATTERN), x: IsInt, y: IsInt }` and `POST /commands/goto` → `respond(this.engine.goto(...))`.

- [ ] **Step 1: Write failing tests:**
  - `gotoParams(1,3,4) === 'R1 GOTO 3,4'` and `unreachableParams(1,3,4) === 'R1 3, 4'`.
  - `goto` inserts one `QueuedCommand { command: 'GOTO', params: '3,4' }` after the existing queue, and writes a QUEUE entry `R1 GOTO 3,4`.
  - Unknown robot → `{ ok: false, reason: 'Robot R9 not found' }`. No cell at x/y → `No cell at 9,9`. Nothing is inserted or logged in either case.
  - An Obstacle target and an occupied target are both enqueued (ok).
  - e2e: `POST /commands/goto { rId: 'R1', x: 2, y: 2 }` → 200 `{ ok: true }`. A missing `x`, or `rId: 'r1'` → 400.
- [ ] **Step 2: Run** `npm run test -w apps/api -- src/engine src/log-entry`. Expected: FAIL.
- [ ] **Step 3: Implement.** Follow `queue()` (same FK-violation guard) and use `cellAt` for the "no cell" check.
- [ ] **Step 4: Run** `npm run test -w apps/api` and `npm run test:e2e -w apps/api`. Expected: PASS.

---

### Task 5: Engine runs GOTO each tick

**Files:**
- Modify: `apps/api/src/engine/engine-commands.service.ts`, `apps/api/src/engine/engine.service.ts`
- Test: `apps/api/src/engine/engine.service.spec.ts` (the GOTO cases may go in a new `engine-goto.spec.ts` that follows the existing spec's DB setup), plus `engine-logging.spec.ts` for rollback

**Interfaces:**
- Consumes: `findFirstStep` (Task 2), `NextCommand` GOTO variant and `QueueService.remove` (Task 3), `unreachableParams` (Task 4).
- Produces: `EngineCommandsService.gotoStep(robotId: number, target: Position, manager: EntityManager): Promise<GotoStep>`, where
  `type GotoStep = { kind: 'ARRIVED' } | { kind: 'NO_PATH' } | { kind: 'MOVE'; next: Position }`.
  It loads the robot, the floor's cells, and every robot on the floor. If the robot is on the target → `ARRIVED`. Otherwise it calls `findFirstStep` with walls = Obstacle cells + every other robot's cell. `null` → `NO_PATH`. Otherwise it updates the robot's `direction` to the step direction (a free turn) and returns `MOVE` with the next cell.

- [ ] **Step 1: Write failing tests** (5x5 unless stated, robot R1 at `(0,0)` facing N):
  - GOTO `0,2`: tick 1 → R1 at `0,1` NORTH, GOTO still queued. Tick 2 → `0,2`, GOTO removed.
  - GOTO `2,0` facing N: tick 1 → R1 at `1,0` **EAST** (turned and moved in one tick).
  - Tie: GOTO `1,1` → the first step is N, so `0,1`.
  - Already on target: GOTO `0,0` with a MOVE queued behind it. Tick 1 → GOTO removed, R1 has not moved. Tick 2 → the MOVE runs.
  - Another robot's cell is a wall: R2 at `0,1`, GOTO `0,2` → R1 goes E to `1,0`.
  - No path (target `2,2` is an Obstacle): ticks 1 and 2 → R1 stays, GOTO still queued, no UNREACHABLE entry. Tick 3 → GOTO removed, and one `UNREACHABLE` entry `R1 2, 2` / `OK` is logged **before** that tick's `TICK` entry. A queued MOVE behind it runs on tick 4.
  - Streak reset: no path on ticks 1 and 2, a path on tick 3 (toggle the obstacle off via `obstacle()`), no path again on tick 4 (toggle it back on) → GOTO still queued after tick 4.
  - A blocked GOTO move: R1 GOTO `1,0`, and R2 at `2,0` facing W with MOVE queued. R1 (lower displayId) wins `1,0`, R2 gets `Blocked by "R1"`. Then swap the IDs so the GOTO robot loses: it stays, faces the step direction, and the GOTO stays queued.
  - `scenarioMode` true: no UNREACHABLE entry, but the GOTO is still dropped on tick 3.
  - Rollback (`engine-logging.spec.ts`): make the TICK entry write fail on the 3rd no-path tick → the GOTO is still queued, and the next successful tick counts as the 3rd (UNREACHABLE fires then).
  - `reset()` clears the counter: 2 no-path ticks, `reset()`, then 2 more → the GOTO is still queued.
- [ ] **Step 2: Run** `npm run test -w apps/api -- src/engine`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `EngineService`: add `private noPathTicks = new Map<number, number>()`. `applyTick(manager, tick)` returns the next map, and `advance()` assigns it only after the transaction commits, next to `currentTick = tick`. `reset()` sets it to a new empty `Map`.
  - In `applyTick`, process GOTO items in `displayId` order before `moveAll`, using `gotoStep`:
    - `ARRIVED` → `queueService.remove`.
    - `NO_PATH` → count = old + 1. At 3 → `remove`, then `log(manager, 'UNREACHABLE', unreachableParams(...))`. Otherwise put the count in the next map.
    - `MOVE` → add the robot id to the move list and remember `next`.
  - After `moveAll` returns its blocks: each GOTO robot that was not blocked and whose `next` equals its target → `remove`.
  - LEFT/RIGHT handling and the TICK entry stay as they are.
- [ ] **Step 4: Run** `npm run test -w apps/api`, `npm run test:e2e -w apps/api`, and `npm run -s scenario -- scenario-1.txt` through `scenario-5.txt`. Diff each against `scenarios/expected/`. Expected: all PASS, reports unchanged.

---

### Task 6: Web — GOTO in the API service, model and queue panel

**Files:**
- Modify: `apps/web/src/app/models/queued-command.model.ts`, `apps/web/src/app/services/simulation-api.service.ts`, `apps/web/src/app/components/queue-panel/queue-panel.html`
- Test: `queue-panel.spec.ts`, the service spec if one exists (otherwise cover it in `app.spec.ts` in Task 7)

**Interfaces:**
- Produces: `QueuedCommand.command: CommandName | 'GOTO'`. `CommandName` stays `'MOVE' | 'LEFT' | 'RIGHT'`.
- Produces: `SimulationApiService.gotoCommand(displayId: number, x: number, y: number): Observable<void>` → `POST /commands/goto { rId: 'R<displayId>', x, y }`.

- [ ] **Step 1: Write failing tests:** the queue panel renders `GOTO 3,4` for `{ command: 'GOTO', params: '3,4' }` and `MOVE` (no trailing params) for `{ command: 'MOVE', params: null }`.
- [ ] **Step 2: Run** `npm run test -w apps/web`. Expected: FAIL.
- [ ] **Step 3: Implement.** The panel shows `command` followed by ` params` only when `params` is non-null.
- [ ] **Step 4: Run** `npm run test -w apps/web`. Expected: PASS.

---

### Task 7: Web — Shift+Click issues GOTO, plus hint text

**Files:**
- Modify: `apps/web/src/app/components/cell/cell.ts` + `cell.html`, `apps/web/src/app/components/grid/grid.ts` + `grid.html`, `apps/web/src/app/app.ts` + `app.html`
- Test: `cell.spec.ts`, `grid.spec.ts`, `app.spec.ts`

**Interfaces:**
- Produces: `Cell.clicked = output<{ shiftKey: boolean }>()`, emitted from both `(click)` and `(keydown.enter)` with the event's `shiftKey`.
- Produces: `Grid.gotoRequested = output<{ x: number; y: number }>()`. `Grid.onCellClick(cell, shiftKey: boolean)`.
- Produces: `App.onGotoRequested({ x, y })`. It sends `api.gotoCommand(robot.displayId, x, y)`, and on success calls `reloadQueue()`. On failure it calls `addError(COMMAND_ERROR)`. It is shaped like `sendCommand`.

- [ ] **Step 1: Write failing tests:**
  - `cell.spec`: a click with `shiftKey: true` emits `{ shiftKey: true }`, and a plain click emits `{ shiftKey: false }`.
  - `grid.spec`: Edit off + robot selected + Shift+Click on an empty Open cell → `gotoRequested` emits `{x, y}` and there is **no** `placeCommand`. Shift+Click on an Obstacle or occupied cell → no emit and no POST. Edit **on** + Shift+Click → `obstacleCommand` (normal toggle) and no emit. No robot selected + Shift+Click → normal place (`placeCommand` with no `rId`).
  - `app.spec`: `gotoRequested` → `gotoCommand(displayId, x, y)`, then the queue panel is refetched. On failure → `Command failed to queue.` is shown. With a robot selected, the text `Shift + Click an empty cell to issue a GOTO command` renders below the movement buttons. With no robot selected it does not render.
- [ ] **Step 2: Run** `npm run test -w apps/web`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `grid.html`, wire `(clicked)="onCellClick(cell, $event.shiftKey)"` and bind `(gotoRequested)` in `app.html`. In `app.html`, make `area-controls` a `flex flex-col items-center gap-2` wrapper around the existing button row. Below the row, add `@if (selectedRobotId() !== null) { <p class="text-sm">Shift + Click an empty cell to issue a GOTO command</p> }`.
- [ ] **Step 4: Run** `npm run test -w apps/web`, `npm run lint`, `npm run build`. Expected: all PASS.
- [ ] **Step 5: Manual check** (`npm run dev:api` + `npm run dev:web`). Select a robot and Shift+Click a cell behind an obstacle. The queue panel shows `GOTO x,y`. Step a few times: the robot paths around the obstacle, and the GOTO leaves the panel on arrival. Shift+Click on a walled-in cell, then Step 3 times: the Log shows `UNREACHABLE R<n> x, y: OK`.
