# Plan: implement robot-rules.md (+ frontend.md Errors)

## Context
`.claude/rules/robot-rules.md` defines how robots are placed, shown, selected and commanded, and how the per-robot queue panel works. `frontend.md` Errors defines a shared stacked error list. Neither exists in code yet: the robot component uses orange and a rotated `↑`, App's command handlers are stubs, `SimulationApiService` is empty, and the API's command names are `TURN_LEFT`/`TURN_RIGHT`.

User decisions:
- **Prerequisite**: floor-grid.md is implemented first, in its own plan. This plan assumes Grid already injects `SimulationApiService` and loads the floor and cells from the API, with real cell Ids. Edit mode (`editMode` input on Grid and the cell-click handler) is also assumed to exist, because the selection tests check "no `PATCH /cells`".
- `params` becomes **nullable via a new migration**.
- The **Errors list is built in this plan**.
- A failed `POST /robots` shows **`Robot failed to place.`** This adds a new rule and test to robot-rules.md.

TDD: write each spec first, then the code. No commits without asking.

## 1. Rules/docs
- `robot-rules.md` Placement: add "A failed `POST /robots` renders nothing and shows `Robot failed to place.` (see Errors in `frontend.md`)". Add a matching test line under `grid.spec.ts`.
- Append an `AI_USAGE.md` entry (≤500 chars). Copy this plan to `.claude/plans/robot-rules-impl-plan.md`.

## 2. API (`apps/api/`)
- `src/shared/types.ts`: `COMMANDS = ['MOVE', 'LEFT', 'RIGHT']`.
- `database/entities/queued-command.entity.ts`: `params` becomes `@Column({ type: 'varchar', nullable: true }) params: string | null`. Generate the migration with `npm run db:migrate:generate -- database/migrations/queued-command-params-nullable`, review it, then `npm run db:migrate`.
- `queued-command/dto/create-queued-command.dto.ts`: `params?: string` with `@ValidateIf((_, v) => v !== undefined) @IsString()`. This copies the update DTO, so a missing value passes and `null` is still rejected. The service saves `params ?? null`.
- `queued-command.service.ts`: add `findByRobot(robotId)` → `find({ where: { robot: { id: robotId } }, order: { id: 'ASC' }, relations: { robot: true } })`. Export the service from `QueuedCommandModule`.
- `robot/robot.controller.ts`: add `@Get(':id/queued-commands')` → `queuedCommandService.findByRobot(id)`. `RobotModule` imports `QueuedCommandModule`.
- `robot/robot.service.ts` `create`: inject `Repository<Cell>` (add `Cell` to `forFeature`). Throw `BadRequestException` if the cell is missing (this covers "outside the grid"), if it is an Obstacle, or if a robot is already on it (`repo.exists({ where: { cell: { id } } })`). Save only after these checks pass. `findAll` already loads `cell` (x/y), so keep it as is and keep its test.
- Tests:
  - `robot.service.spec.ts`: obstacle/occupied/missing cell → `BadRequestException`, `save` not called.
  - `queued-command.service.spec.ts` + DTO tests (`validate()` from class-validator): `LEFT`/`RIGHT`/`MOVE` OK; `TURN_LEFT`, `left`, `JUMP` rejected; missing `params` OK. `findByRobot` query uses the robot filter and ascending Id.
  - Update the existing specs that use `TURN_LEFT`/`TURN_RIGHT` (`queued-command.controller.spec.ts`).
  - `test/crud.e2e-spec.ts`:
    - Change `TURN_RIGHT` to `RIGHT`.
    - The round-trip test PATCHes the cell to `obstacle: true` before placing a robot on it, which now fails. Change that cell PATCH to a field that isn't `obstacle`.
    - Add `GET /robots/:id/queued-commands` (only that robot's commands, ascending Id).
    - Add a persistence test: create a robot, close the app, start a new instance on the same DB file, and `GET /robots` returns it with its cell and direction.

## 3. Web models and service (`apps/web/src/app/`)
- `models/queued-command.model.ts`: `command: 'MOVE' | 'LEFT' | 'RIGHT'`, `params: string | null`.
- `models/robot.model.ts`: make `x`/`y` `readonly`.
- `services/simulation-api.service.ts` (extends what floor-grid adds; uses `environment.apiUrl`):
  - `getRobots()` maps the API `{ id, direction, cell: { id, xPosition, yPosition } }` to `Robot` (`cellId`, `x`, `y`).
  - `createRobot(cellId)` sends `POST /robots { cellId, direction: Direction.North }` and maps the result the same way.
  - `getQueuedCommands(robotId)` and `createQueuedCommand(robotId, command)` map `robot.id` → `robotId`.

## 4. Robot component (`components/robot/`)
- Inputs: `robot`, `selected` (boolean). Output: `clicked`. A host `(click)` calls `event.stopPropagation()` and then emits, so the click never reaches the cell.
- Template: the Styles table classes (`box-border border-2 bg-blue-200 text-blue-900`, plus `border-green-300` when selected and `border-blue-900` otherwise) on a `relative flex items-center justify-center` square.
  - The arrow is a centered span, taken from a `Record<Direction, string>` map: `^ > v <`.
  - The ID is `absolute inset-x-0 bottom-0 text-center`, showing `R{{id}}`.
  - Remove the orange colors and the rotation transform.
- `robot.spec.ts`: covers every test listed under robot.spec in the rules. Add a direction.ts values test there too.

## 5. Cell + Grid
- `cell.ts`: add a `selected` input and a `robotClicked` output, and forward both to/from `<app-robot>`.
- `grid.ts`:
  - Grid owns `robots = signal<Robot[]>`, loaded with `getRobots()` on init. This replaces the `robots` input from App.
  - New input `selectedRobotId`. New outputs `robotClicked(id)` and `error(message)`.
  - In the cell-click handler's non-edit branch: if the cell is not an obstacle and `robotsByCell` doesn't have it, call `createRobot` and append the result. On failure, emit `error('Robot failed to place.')`.
  - The `Grid.error` output is also how floor-grid's resize message reaches App. If the floor-grid plan built its own error display, replace it with this output.
- `grid.spec.ts`: the robot tests listed in the rules, plus the new placement-failure test.

## 6. App (selection, commands, queue, errors)
- `app.ts`:
  - Drop the `robots` signal.
  - `onRobotClicked(id)` toggles `selectedRobotId`. On a new selection: `queue.set([])`, then `getQueuedCommands(id)` → `queue.set`. On deselect: `queue.set([])`.
  - `onTurnLeft/onTurnRight/onMove` → `sendCommand('LEFT'|'RIGHT'|'MOVE')`. With no selection this returns early, which also covers the arrow keys, since they go through the same handlers.
  - On success, append the command to `queue` if that robot is still selected. On failure, `addError('Command failed to queue.')`.
  - Errors: `errors = signal<{ id: number; text: string }[]>` with a counter id, plus `addError`, `dismissError(id)` and `clearErrors()`.
- `app.html`:
  - Pass `[selectedRobotId]` to `<app-grid>`, and handle its `(robotClicked)` and `(error)` outputs.
  - Command buttons get `[disabled]="selectedRobotId() === null"`.
  - Add an errors block (`area-errors`) between the grid and the controls: a `<ul class="max-h-[50px] overflow-y-auto text-red-600">` with one `<li>` per error, each with an X button (`aria-label="Dismiss error"`). `@if (errors().length > 1)` shows a right-aligned `<app-button label="Clear errors">`.
- `app.css`: add an `errors` row between `grid` and `controls` in both template-area layouts.
- `app.spec.ts`: the robot tests and the frontend.md Errors tests, as listed in the rules. Mock `SimulationApiService`.

## 7. Queue panel
- No code change needed (it already renders in the given order). Update `queue-panel.spec.ts` data to `LEFT`/`RIGHT`.

## Verification
- `npm run test`, `npm run test:e2e -w apps/api`, `npm run lint`, `npm run build`.
- Check that every rule bullet in robot-rules.md and frontend.md Errors has a passing test.
- Manual (`npm run dev:api` + `npm run dev:web`):
  - Click an empty cell → `R<id>` `^` appears. Clicking it again toggles selection, and the queue loads.
  - The buttons and arrow keys append `LEFT`/`RIGHT`/`MOVE` to the queue.
  - Reload and restart the API → the robots are still there.
  - Stop the API and press Move → `Command failed to queue.` appears. Two errors → `Clear errors` shows.
