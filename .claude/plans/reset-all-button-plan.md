# Reset All Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `Reset All` button next to `Log` that, after a `Reset the entire floor?` confirm, wipes the current floor and returns it to an empty 5 x 5 all-Open grid.

**Architecture:** One new endpoint `POST /floors/:id/reset`. `FloorService.reset` pauses the engine and sets its tick to 0 (`EngineService.reset`), then in one transaction deletes the floor's queued commands, robots and cells, plus all log entries, sets the floor to 5 x 5 and inserts 25 Open cells. The floor id stays the same. On the client, `Grid.resetFloor()` calls the endpoint and shows the reloaded floor. `App` confirms with `window.confirm`, then clears the selection and queue and re-reads the engine state.

**Tech Stack:** NestJS + TypeORM (SQLite), Angular standalone components, Vitest.

**Spec:** the user's request plus these answers:
- Reset in place via a new endpoint (keep the floor row and its id).
- Clear the log: delete all `LogEntry` rows.
- Engine: pause if running, and set `currentTick` to 0.
- Confirm with the browser's `window.confirm` (its buttons read OK / Cancel, not Yes / No; accepted).

## Global Constraints

- Button label: `Reset All`, placed directly after the `Log` button in `area-top`.
- Confirm text, exactly: `Reset the entire floor?`
- Default size: width 5, height 5. All cells `obstacle: false`.
- No schema change and no migration (`synchronize: false`).
- Do not commit without asking the user (CLAUDE.md ground rule).
- Code must pass ESLint + Prettier.

## Review Focus

1. **Reset while Play is running.** On Yes, the engine stops on the server before the DB is wiped. Polling stops, and the button goes back to `Play` exactly as if the engine had never played. Tested in Task 1 (`reset stops a running engine`) and Task 3 (`Reset All while running → Play label`).
2. **No to the confirm.** Nothing is sent and nothing changes. A running engine keeps running and the button still reads `Pause`. Tested in Task 3.
3. **Robots with queued commands.** Their queued commands must go first, or the FK delete fails. Tested in Task 2 (`reset deletes robots and their queued commands`).
4. **Floor already larger than 5 x 5 with obstacles.** The result is exactly 25 Open cells at (0..4, 0..4). Tested in Task 2.
5. **Reset fails (server down / 404).** The grid keeps its current state and an error shows. Tested in Task 3.

---

### Task 1: `EngineService.reset()`

**Files:**
- Modify: `apps/api/src/engine/engine.service.ts`
- Test: `apps/api/src/engine/engine.service.spec.ts`

**Interfaces:**
- Produces: `EngineService.reset(): EngineState`. It calls the existing private `stop()`, then sets `currentTick = 0` and clears `errors`, and returns `getState()`.

- [ ] **Step 1: Write the failing tests** (follow the existing spec's setup and fake timers)
  - `reset sets currentTick to 0 and running to false`: after 2 `step()` calls, `reset()` returns `{ currentTick: 0, running: false, errors: [] }`.
  - `reset stops a running engine`: `toggle()` to start, then `reset()`. Advancing the fake timers by 3 × `tickRate` leaves `currentTick` at 0 and `queue.doNext` is not called again.
- [ ] **Step 2: Run** `npm run test -w apps/api -- engine.service`. Expected: FAIL, `reset` is not a function.
- [ ] **Step 3: Implement `reset()`** with a one-line doc comment.
- [ ] **Step 4: Run** the same command. Expected: PASS.

### Task 2: `POST /floors/:id/reset`

**Files:**
- Modify: `apps/api/src/floor/floor.model.ts`: add `export const DEFAULT_FLOOR_SIZE = 5;`
- Modify: `apps/api/src/floor/floor.service.ts`
- Modify: `apps/api/src/floor/floor.controller.ts`
- Modify: `apps/api/src/floor/floor.module.ts`: add `QueuedCommand` and `LogEntry` to `forFeature`, and import `EngineModule`.
- Test: `apps/api/src/floor/floor.service.spec.ts` (needs `EngineModule` available: it comes in through `FloorModule`), `apps/api/test/floor.e2e-spec.ts`

**Interfaces:**
- Consumes: `EngineService.reset()` (Task 1).
- Produces:
  - `FloorService.reset(id: number): Promise<Floor>` returns the floor as `{ id, width: 5, height: 5 }`. Throws `NotFoundException` for an unknown id (through `findOne`).
  - `FloorController`: `@Post(':id/reset') @HttpCode(200) reset(@Param('id', ParseIntPipe) id)`. It has no request body, so it needs no DTO.

- [ ] **Step 1: Write the failing service tests**
  - `reset returns a 5×5 floor with 25 Open cells`: create a 8×6 floor, set 3 cells to obstacle, then `reset(id)`. Result: `{ width: 5, height: 5 }`. `cellsOf(id)` has length 25, all have `obstacle === false`, and the coordinates are exactly x 0..4 × y 0..4.
  - `reset deletes robots and their queued commands`: place 2 robots, each with 1 queued command, then `reset`. The robot count and QueuedCommand count are both 0.
  - `reset deletes all log entries`: save 2 `LogEntry` rows, then `reset`. The LogEntry count is 0.
  - `reset keeps the floor id`: `reset(id).id === id`, and the `Floor` count is unchanged.
  - `reset pauses the engine and sets tick to 0`: `engine.toggle()` (running), then `reset`. `engine.getState()` gives `running: false, currentTick: 0`.
  - `reset throws 404 for a missing floor`: `reset(999)` rejects with `NotFoundException`.
- [ ] **Step 2: Write the failing e2e test** in `floor.e2e-spec.ts`: `POST /floors/:id/reset → 200, then GET /floors/:id is 5×5`.
- [ ] **Step 3: Run** `npm run test -w apps/api -- floor.service` and `npm run test:e2e -w apps/api -- floor`. Expected: FAIL.
- [ ] **Step 4: Implement**
  - Pull the cell-building loop in `create` out into a private `insertOpenCells(manager: EntityManager, floor: Floor): Promise<void>` and use it from both `create` and `reset`.
  - `reset`: `findOne(id)`, then `engine.reset()`, then one transaction that:
    1. Finds the ids of robots whose `cell.floor.id = id`.
    2. If there are any, deletes `QueuedCommand` where `robot` is `In(ids)`, then deletes those `Robot` rows.
    3. Deletes the `Cell` rows of the floor.
    4. Clears `LogEntry` (`delete({})` is rejected by TypeORM, so use `createQueryBuilder().delete().from(LogEntry).execute()` or `clear()`).
    5. Saves the floor as `{ id, width: DEFAULT_FLOOR_SIZE, height: DEFAULT_FLOOR_SIZE }`.
    6. Calls `insertOpenCells`.

    Return `findOne(id)`.
  - Controller: a single line calling `this.service.reset(id)`.
- [ ] **Step 5: Run** both commands again, then `npm run test -w apps/api` (all tests). Expected: PASS. Existing `create` tests must still pass after the refactor.

### Task 3: Client: `Reset All` button

**Files:**
- Modify: `apps/web/src/app/services/simulation-api.service.ts` (+ spec)
- Modify: `apps/web/src/app/components/grid/grid.ts` (+ `grid.spec.ts`)
- Modify: `apps/web/src/app/app.ts`, `apps/web/src/app/app.html` (+ `app.spec.ts`: add `resetFloor` to the `api` mock record)

**Interfaces:**
- Consumes: `POST /floors/:id/reset → Floor` (Task 2).
- Produces:
  - `SimulationApiService.resetFloor(id: number): Observable<Floor>`: `POST ${api}/floors/${id}/reset` with body `{}`.
  - `Grid.resetFloor(): Observable<void>`: `resetFloor(floor.id)`, then the existing `withCells`, then `show` (in a `tap`), then `map(() => undefined)`. With no floor loaded it returns `EMPTY`. It emits no `gridError` itself, because App reports the error.
  - `App.onResetAll(): void` and `export const RESET_ERROR = 'Floor failed to reset.';`

- [ ] **Step 1: Write the failing tests**
  - api spec: `resetFloor POSTs /floors/1/reset`.
  - grid spec: `resetFloor shows the returned 5×5 floor, its cells and no robots`. Start with an 8×6 floor that has an obstacle and a robot. After `resetFloor()` the stub returns 5×5 Open cells and `[]` robots: the grid renders 25 cells, none of them obstacles, and no `app-robot`. The sliders read 5 / 5.
  - app spec (stub `window.confirm` with `vi.spyOn(window, 'confirm')`):
    - `Reset All sits right after Log in the top bar`.
    - `Reset All → confirm('Reset the entire floor?')`.
    - `No → no request; robots and selection unchanged`: `confirm` returns false, and `resetFloor` is not called.
    - `Yes → resetFloor(1); selection and queue clear; engine state re-read`: select robot 7 first. After the click, the movement controls are disabled, the queue panel is empty, and `getEngine` was called again.
    - `Reset All while running → Play label`: start with the engine running. `getEngine` after the reset returns `running: false, currentTick: 0`, and the label reads `Play`.
    - `Reset All while running, No → still Pause; toggleEngine/resetFloor not called; polling continues`.
    - `Reset fails → "Floor failed to reset." shows; grid unchanged`.
    - `Reset fails while running → engine state re-read; label follows it`: `resetFloor` errors and `getEngine` then returns `running: false`, so the label reads `Play`.
- [ ] **Step 2: Run** `npm run test -w apps/web`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement**
  - `app.html`: `<app-button label="Reset All" (pressed)="onResetAll()" />` after the Log button.
  - `onResetAll`: `if (!window.confirm('Reset the entire floor?')) return;`, then `stopPolling()` and subscribe to `this.grid().resetFloor()`.
    - `next`: `selectedRobotId.set(null)`, `queue.set([])`, then `refreshEngine()`.
    - `error`: `addError(RESET_ERROR)`, then `refreshEngine()`.
    - New private `refreshEngine(): void`: `api.getEngine()` → `applyEngineState`. On error, `addError(QUEUE_LOAD_ERROR)`. The engine state is re-read whether or not the reset succeeded, so the Play/Pause label always matches the server. A failed reset may already have stopped the engine. A 404 leaves it running, and then polling resumes.
- [ ] **Step 4: Run** `npm run test -w apps/web`. Expected: PASS.

### Task 4: Verify and record

- [ ] `npm run lint`, `npm run test`, `npm run test:e2e -w apps/api`, `npm run build`: all pass.
- [ ] Add a line to `.claude/rules/frontend.md` under Engine controls: `Reset All` (after Log) confirms with `Reset the entire floor?`, and Yes resets the floor to an empty 5 x 5 Open grid, clears the log, pauses the engine and sets the tick to 0.
- [ ] Add an `AI_USAGE.md` entry (500 characters or fewer).
- [ ] Ask the user before committing.
