# Floor Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `.claude/rules/floor-grid.md`. The Grid loads or creates the persisted floor and has width/height sliders that save on release. The API grows and shrinks cells and relocates robots, or rejects the resize. App shows rejections in the stacked error list from `frontend.md`.

**Architecture:** API: `FloorService` creates cells on `POST /floors` and resizes inside one TypeORM transaction on `PATCH /floors/:id`. A pure `planResize` function in `floor.model.ts` picks robot targets. Client: `SimulationApiService` gets floor and cell methods. `Grid` owns the floor, its cells and the sliders, and emits `resizeError`. `App` owns the error list.

**Tech Stack:** NestJS 12 + TypeORM (better-sqlite3), Angular 22 standalone + signals, Vitest (both apps), Tailwind.

**Spec:** `.claude/rules/floor-grid.md` and the Errors section of `.claude/rules/frontend.md`. Background: `.claude/plans/floor-grid-rules.md`.

## User decisions (2026-10-22)

- Scope: floor grid only. Edit mode and robot rules are separate plans.
- Errors: build the `frontend.md` stacked error list in App. Grid emits the text.
- Cells: `POST /floors` also creates width × height Open cells. Grid loads `GET /cells`, keeps the cells whose `floor.id` matches, and reloads them after each successful PATCH.
- Robots: the Grid does not load robots yet. Robot relocation is built and tested in the API only. `App` keeps passing `robots()`, which stays empty.

## Decisions for review (my defaults, not stated in the rules. Change any of them before execution.)

1. Rejection is HTTP **409** `ConflictException` with the exact message. The client shows the message only on 409. Any other PATCH error reverts the sliders without showing a message.
2. `FloorService.remove` deletes the floor's cells and then the floor, in one transaction. This is needed because floors now always have cells (FK). If a robot is on one of those cells, the delete fails as it does today. That behavior is unchanged and out of scope.
3. Sliders sit **above** the floor inside Grid, labelled `Width` and `Height`, with the current value shown next to each. The layout diagram does not draw them.
4. `crud.e2e-spec.ts` creates cells at `x=19, y=19`, because every in-bounds coordinate is now taken. CRUD on `/cells` does not check bounds.
5. `floor.service.spec.ts` changes from repo mocks to a real in-memory SQLite DB (migrations applied). "Changes nothing" can only be shown against a real transaction.
6. Errors area: wide layout `'errors .'` row between grid and controls. Narrow: `grid, errors, queue, controls`.

## Global Constraints

- Width/height: integers 1–20 inclusive. Default 5.
- Origin (0,0) bottom-left. X east, Y north. The first rendered row is `y = height - 1`.
- Error text exactly: `Can't resize grid, not enough space for existing robots`
- Nearest = Manhattan distance from the robot's old position. Ties: lowest y, then lowest x. Displaced robots are placed in ascending Id order, and each claims its cell before the next is placed.
- Not enough room → nothing changes (floor, cells, robots).
- Sliders: `type="range"`, min 1, max 20, step 1. PATCH on `change` only, never on `input`.
- Errors list: red text, `max-h-[50px] overflow-y-auto`, X per error removes only that error, `Clear errors` button bottom right, only when there are 2+ errors.
- No new packages. No schema change (no migration). `synchronize: false`.
- Kebab-case files, strict TS, must pass `npm run lint` and Prettier.

## Review Focus

1. **Shrink that displaces a robot onto a cell that is itself being deleted.** The target must be in the new bounds. Covered by "target is inside new bounds" in Task 1.
2. **Shrink to 1×1 with one robot outside and the (0,0) cell an Obstacle.** No room, so 409 and nothing changes. Covered by the no-room test.
3. **Resize where only one axis changes, or with no change at all.** A PATCH with the same size must not create or delete anything. Task 1 "same size is a no-op".
4. **Two slider releases in quick succession.** The second PATCH must send both current values, not stale ones. Grid always sends `{ width: width(), height: height() }`. Task 3 test "change sends both axes".
5. **Revert after a failed PATCH that follows a successful one.** Revert goes to the last *saved* size, not the initial 5. Task 3 test.

---

### Task 1: API — create cells on POST, resize on PATCH

**Files:**
- Create: `apps/api/test/sqlite-test-db.ts`
- Modify: `apps/api/src/floor/floor.model.ts`, `floor.service.ts`, `floor.module.ts`, `floor.service.spec.ts`
- Modify: `apps/api/test/crud.e2e-spec.ts` (use the helper; decision 4)

**Interfaces:**
- Produces:
  - `sqliteTestDb(database: string): DynamicModule` returns `TypeOrmModule.forRoot({ type: 'better-sqlite3', database, entities, migrations, migrationsRun: true, synchronize: false })`. It holds the `import.meta.glob` migration loader moved out of `crud.e2e-spec.ts` (keep its comment and the `/// <reference types="vite/client" />`).
  - `export const RESIZE_NO_ROOM = "Can't resize grid, not enough space for existing robots";` in `floor.model.ts`.
  - `planResize(size: { width: number; height: number }, cells: Pick<Cell, 'id' | 'obstacle' | 'xPosition' | 'yPosition'>[], robots: { id: number; cellId: number }[]): { create: Position[]; deleteCellIds: number[]; moves: { robotId: number; cellId: number }[] } | null`. It returns `null` when a displaced robot has no free target.
  - `FloorService.create` → floor + `width × height` Open cells. `update` → applies `planResize` in `dataSource.transaction`, or throws `ConflictException(RESIZE_NO_ROOM)`. `remove` → deletes cells, then the floor (decision 2).
- `FloorModule` imports `TypeOrmModule.forFeature([Floor, Cell, Robot])`. The service injects `DataSource` and uses `manager.getRepository(...)` inside transactions.

`planResize` algorithm (not determined by the signature):
```
create      = in-bounds coordinates with no existing cell
kept        = existing cells inside bounds
deleteIds   = existing cells outside bounds
occupied    = set of cellIds holding robots that are NOT displaced
for robot in displaced robots sorted by id ascending:
  candidates = kept cells, !obstacle, id not in occupied
  pick min by (manhattan(old pos, cell), cell.y, cell.x); none → return null
  occupied.add(pick.id); moves.push({ robotId, cellId: pick.id })
```
~~Newly created cells never need to be candidates.~~ Wrong for a mixed resize (one axis grows, the other shrinks): newly created cells are candidates too. See Review fixes.

Order of writes in `update`: save the new size, insert the `create` cells, update the robots' `cell` from `moves`, then delete `deleteCellIds`. All of it runs in one transaction.

- [ ] **Step 1: Write failing tests in `floor.service.spec.ts`** (rewrite: module = `sqliteTestDb(':memory:')` + `FloorModule`. Seed robots with `dataSource.getRepository(Robot)`.)
  - `rejects width/height outside 1–20`: `validate(plainToInstance(UpdateFloorDto, v))` has errors for `{width:0}`, `{width:21}`, `{height:0}`, `{height:21}`, `{width:1.5}`, and none for `{width:1, height:20}`.
  - `create makes width×height Open cells`: create 3×2 → 6 cells, all `obstacle:false`, coordinates `{0..2}×{0..1}`.
  - `grow creates an Open cell for every new coordinate; existing cells unchanged`: 2×2, mark (1,1) obstacle, update to 3×3 → 9 cells. (1,1) has the same id and is still an obstacle.
  - `same size is a no-op`: 3×3 update `{width:3,height:3}` → the same 9 cell ids.
  - `shrink deletes cells outside new bounds`: 4×4 → 2×3 → exactly the coordinates `{0,1}×{0,1,2}` remain.
  - `displaced robot moves to nearest free Open cell`: 5×5, robot at (4,2), shrink to width 3 → robot at (2,2).
  - `Manhattan tie → lowest y wins`: 5×5, (2,2) obstacle, robot at (4,2), shrink to width 3 → distance-3 candidates (2,1), (1,2), (2,3). Expect (2,1).
  - `Manhattan and y tie → lowest x wins`: 3×5, (1,2) and (1,1) obstacles, robot at (1,4), shrink to height 3 → distance-3 candidates (0,2), (2,2). Expect (0,2).
  - `target excludes Obstacle cells and occupied cells`: 3×3, robot A at (1,1) (stays), robot B at (2,2), (1,0) obstacle, shrink to 2×2. Without the exclusions B would take (1,1) (distance 2) or (1,0) (distance 3, lower y). Expect B at (0,1), and A still at (1,1).
  - `target is inside the new bounds`: robot at (4,4) on 5×5, shrink to 4×4 → (3,3).
  - `multiple displaced robots placed in ascending Id order, each claiming first`: 4×1. Create robot id1 at (3,0) first, then id2 at (2,0). Shrink to width 2 → id1 at (1,0) and id2 at (0,0). A closest-first order would give id2 (1,0).
  - `not enough room → 409 and nothing changes`: 2×1, robots at (0,0) and (1,0), update width 1 → rejects with `ConflictException` and message `RESIZE_NO_ROOM`. The floor is still 2×1, both cells exist with the same ids, and the robots are on their original cells.
  - `remove deletes the floor and its cells`.

- [ ] **Step 2: Run** `npm run test -w apps/api -- floor.service` → FAIL (no cells created, no relocation).
- [ ] **Step 3: Implement** `sqliteTestDb`, `planResize`, `RESIZE_NO_ROOM`, and the `FloorService` changes. Switch `crud.e2e-spec.ts` to `sqliteTestDb(':memory:')`.
- [ ] **Step 4: Run** `npm run test -w apps/api -- floor.service` → PASS.
- [ ] **Step 5: Fix e2e for decision 4.** In `crud.e2e-spec.ts`, every `POST /cells` uses `xPosition: 19, yPosition: 19`. Run `npm run test:e2e -w apps/api` → PASS. Update `floor.controller.spec.ts` only if it breaks (it mocks the service, so it should not).
- [ ] **Step 6:** `npm run lint` and `npx prettier --check apps/api` → clean.
- [ ] **Step 7: Commit** (ask the user first, per CLAUDE.md) `feat(api): create floor cells and resize with robot relocation`

### Task 2: API e2e — size persists across restart

**Files:**
- Create: `apps/api/test/floor.e2e-spec.ts`

**Interfaces:** Consumes `sqliteTestDb(database)` from Task 1.

- [ ] **Step 1: Write the test** `PATCHed width/height are returned by GET /floors after an app restart`. Use a temp file `join(mkdtempSync(join(tmpdir(), 'fleet-')), 'test.sqlite')`. App 1: `POST /floors {5,5}`, `PATCH /floors/:id {width:7,height:3}`, `app.close()`. App 2 (new `Test.createTestingModule` on the same file): `GET /floors` contains `{ id, width:7, height:3 }`, and `GET /cells` has 21 cells with `floor.id === id`. `afterAll` removes the temp dir (`rmSync(..., { recursive: true, force: true })`).
- [ ] **Step 2: Run** `npm run test:e2e -w apps/api` → PASS. The behavior already exists, so this test guards persistence. Mutation check: temporarily comment out the size save in `update`, see it fail, then restore.
- [ ] **Step 3: Commit** (ask first) `test(api): floor size persists across restart`

### Task 3: Client — API service + Grid owns floor and sliders

**Files:**
- Modify: `apps/web/src/app/services/simulation-api.service.ts`
- Create: `apps/web/src/app/services/simulation-api.service.spec.ts`
- Modify: `apps/web/src/app/components/grid/grid.ts`, `grid.html`, `grid.spec.ts`

**Interfaces:**
- Produces (`SimulationApiService`, base URL `environment.apiUrl`):
  - `getFloors(): Observable<Floor[]>` → `GET /floors`
  - `createFloor(size: FloorSize): Observable<Floor>` → `POST /floors`
  - `updateFloor(id: number, size: FloorSize): Observable<Floor>` → `PATCH /floors/:id`
  - `getCells(floorId: number): Observable<Cell[]>` → `GET /cells`. Keeps rows where `floor.id === floorId` and maps them to the web `Cell` model (`floorId` from `floor.id`).
  - `export type FloorSize = Pick<Floor, 'width' | 'height'>` in `models/floor.model.ts`.
- Produces (`Grid`, selector `app-grid`):
  - Input `robots = input<Robot[]>([])` (unchanged). The `floor` and `cells` inputs are **removed**.
  - Output `resizeError = output<string>()`.
  - Exported constant `RESIZE_ERROR = "Can't resize grid, not enough space for existing robots"` in `grid.ts`.
  - Internal: `floor = signal<Floor | null>(null)`, `width = signal(5)`, `height = signal(5)`, `cells = signal<Cell[]>([])`. Init in `ngOnInit`. `onSizeChange()` PATCHes `{ width: width(), height: height() }`. On success it sets the floor and reloads the cells. On error it resets width/height to `floor()`'s values and emits `RESIZE_ERROR` only if `err.status === 409` (decision 1).
- Template: two `<input type="range" min="1" max="20" step="1">` with `aria-label="Width"` / `aria-label="Height"`, `[value]`, `(input)` that sets the signal, and `(change)="onSizeChange()"`. They sit above the existing `.floor` div (decision 3). The floor div renders only when `floor()` is set. `cellSize` and `orderedCells` read `floor()`/`cells()`.

- [ ] **Step 1: Service spec** with `provideHttpClient()` + `provideHttpClientTesting()`. It asserts the method/URL/body for each of the 4 calls, and that `getCells(2)` drops a row with `floor.id: 1` and maps `floor.id` → `floorId`.
- [ ] **Step 2: Grid spec rewrite** (mock the service with `vi.fn()` returning `of(...)` / `throwError(() => new HttpErrorResponse({ status: 409 }))`). Keep the existing cell-size and 400-cell tests by feeding them through the mocked `getFloors`/`getCells`. Delete the `Origin: 0,0` test: that markup was already removed from `grid.html` in the working tree. New tests:
  - `sliders have min 1, max 20, step 1 and default to 5 before the floor loads` (`getFloors` returns a never-emitting `Subject`).
  - `first rendered row is y = height - 1 and x increases left to right`.
  - `empty GET /floors → createFloor({width:5,height:5}); UI shows 5x5`.
  - `existing floor → no createFloor; sliders and grid show its size` (7×3).
  - `input event does not PATCH; change event PATCHes once with both values`. Set width to 8 via `input`, then `change` → `updateFloor(id, { width: 8, height: 3 })` called once.
  - `successful PATCH reloads cells`.
  - `rejected PATCH reverts sliders and grid to the last saved size`. Use a successful PATCH to 6×3 first, then a 409 on 2×3 → sliders back at 6/3, 18 cells.
  - `409 emits the exact RESIZE_ERROR text`; `non-409 error reverts and emits nothing`.
- [ ] **Step 3: Run** `npm run test -w apps/web` → the new tests FAIL.
- [ ] **Step 4: Implement** the service and Grid per the Interfaces above.
- [ ] **Step 5: Run** `npm run test -w apps/web` → Grid/service specs PASS. `app.spec.ts` will fail until Task 4 (App still binds `[floor]`/`[cells]`). That is expected.
- [ ] **Step 6: Commit** together with Task 4. App does not compile between them.

### Task 4: App — drop local floor, add error list

**Files:**
- Modify: `apps/web/src/app/app.ts`, `app.html`, `app.css`, `app.spec.ts`

**Interfaces:**
- Consumes: `Grid.resizeError`.
- Produces in `App`: `errors = signal<{ id: number; text: string }[]>([])`, `addError(text: string): void` (ids from a private counter), `dismissError(id: number): void`, `clearErrors(): void`. Remove `floor`, `cells`, `openCells`, `DEFAULT_WIDTH/HEIGHT`.
- Template: `<app-grid class="area-grid" [robots]="robots()" (resizeError)="addError($event)" />`. Then `<div class="area-errors">` with a `<ul class="max-h-[50px] overflow-y-auto text-red-600">`. Each `<li>` has its text and a `<button aria-label="Dismiss error">×</button>`. When `errors().length > 1`, a `flex justify-end` row with `<app-button label="Clear errors">` follows. `app.css`: add `.area-errors { grid-area: errors; }`. Wide areas: `'top .' 'grid queue' 'errors .' 'controls .'`. Narrow: `'top' 'grid' 'errors' 'queue' 'controls'` (decision 6).

- [ ] **Step 1: Tests in `app.spec.ts`.** Provide a mock `SimulationApiService` (`getFloors` → `of([{id:1,width:5,height:5}])`, `getCells` → 25 cells). The existing "renders the default 5 x 5 floor" test keeps working through it. Raise errors with `fixture.debugElement.query(By.directive(Grid)).componentInstance.resizeError.emit('...')`.
  - `error text is red and sits below the grid and above the movement controls`: the `li` has `text-red-600`, and `compareDocumentPosition` puts the list after `app-grid` and before the `Turn Left` button.
  - `two errors → both show`.
  - `X removes only that error`.
  - `list has max-h-[50px] and overflow-y-auto`.
  - `Clear errors hidden with one error, shown with two, click empties the list`.
  - `a 409 resize shows the exact text`: the mock `updateFloor` returns 409. Dispatch `change` on the width slider and expect `Can't resize grid, not enough space for existing robots` in the list. This is the end-to-end client path.
- [ ] **Step 2: Run** `npm run test -w apps/web` → the new App tests FAIL.
- [ ] **Step 3: Implement** the App changes.
- [ ] **Step 4: Run** `npm run test`, `npm run lint`, `npm run build` from the repo root → all PASS. Run `npx prettier --check apps/web/src`.
- [ ] **Step 5: Manual check** (`npm run dev:api` + `npm run dev:web`). Fresh DB → 5×5. Drag width to 8 and release → 8×5, and it survives a reload and an API restart. To see the error, insert robots via `POST /robots` on cells (3,*) and (4,*) of a 5×1 floor. Shrink to 1 → the red error shows and the slider snaps back.
- [ ] **Step 6: Commit** Tasks 3+4 (ask first) `feat(web): grid loads floor, size sliders, error list`.
- [ ] **Step 7:** Append an `AI_USAGE.md` entry (≤500 chars).

## Review fixes (2026-10-22)

From the whole-branch review. User decisions in brackets.

- `planResize`: candidates are kept Open cells plus `create` positions. `moves` is now `{ robotId, to: Position }[]`; `update` resolves the target cell id after the insert. Tests: mixed resize to a new cell, nearer new cell beats farther kept cell, 1×1 with (0,0) Obstacle.
- Grid: one `switchMap` pipeline for load and for slider releases. Floor and cells are set together; a newer release cancels the earlier request. Output renamed `resizeError` → `gridError`.
- [Minor 3, 4] Load failures and non-409 PATCH failures emit `SERVER_ERROR = "Server can't be reached"`.
- [Minor 5] Tests: two releases in a row, 1×1 Obstacle case.
- [Minor 6] Ignored. [Minor 7] Accepted as is.
