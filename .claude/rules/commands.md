---
paths:
  - "apps/api/**"
---

# Command rules

## Identity

- Robots have a `displayId` column, separate from the internal primary key `id`.
- Commands identify robots by `RId`: uppercase `R` + an integer (e.g. `R3`). Parse the integer as `displayId`.
- `RId` without a leading uppercase `R` or a valid integer → ignored (see Ignored requests).

## Endpoints

One `POST /commands/<name>` route per command. Params come in the body and are validated by a DTO. Then the route calls the matching Engine method (`engine.md`). All command logic lives in the Engine. Robot command routes (LEFT / RIGHT / MOVE / QUEUE) only enqueue.

| Command  | Route                     | Params                                          |
| -------- | ------------------------- | ----------------------------------------------- |
| LEFT     | `POST /commands/left`     | `rId`                                           |
| RIGHT    | `POST /commands/right`    | `rId`                                           |
| MOVE     | `POST /commands/move`     | `rId`                                           |
| FLOOR    | `POST /commands/floor`    | `width` (int, default 5), `height` (int, default 5) |
| OBSTACLE | `POST /commands/obstacle` | `x` (int, required), `y` (int, required)        |
| PLACE    | `POST /commands/place`    | `rId`, `x` (int), `y` (int), `direction`        |
| QUEUE    | `POST /commands/queue`    | `rId`, `commands` (one or more of `LEFT` / `RIGHT` / `MOVE`) |
| TICK     | `POST /commands/tick`     | `amount` (int, default 1)                       |
| REPORT   | `POST /commands/report`   | none                                            |

## Ignored requests

- Missing or invalid params, an unknown robot, or no matching cell → the request is ignored and nothing changes.
- Never throw in a way that stops the program. The service/Engine returns a descriptive result saying what was ignored and why.
- Over HTTP: 400 with that descriptive message.
- Scenario runner: skip the line silently and continue with the next line (see `scenario-runner.md`).

## LEFT / RIGHT / MOVE

- Each endpoint enqueues its command (`LEFT` / `RIGHT` / `MOVE`) on the robot's FIFO queue. Nothing is applied until a tick.

## QUEUE

- Requires `rId` and `commands`: one or more commands, each exactly `LEFT`, `RIGHT`, or `MOVE` (uppercase).
- Enqueues the commands, in order, on the robot's FIFO queue.
- Missing or invalid params, or any invalid command → the whole request is ignored and nothing is enqueued.

## Tick execution

Each Engine `step()` (`apps/api/src/engine`, see `engine.md`) calls `doNext()` (`apps/api/src/queue`, see `queue.md`) and executes the commands it returns. Per tick:

1. `doNext()` returns one promise per robot, in `displayId` order, each resolving to its head command (FIFO) or `null`; the head is deleted from the queue.
2. `LEFT`: rotate counter-clockwise in place, `(d + 3) % 4`. `RIGHT`: rotate clockwise in place, `(d + 1) % 4`.
3. All `MOVE`s are resolved together (below). Robots that are not moving this tick stay in their cells.
4. Persist every new direction and cell to the DB.

### MOVE resolution

A `MOVE` targets the cell one step forward in the robot's direction (N = +y, E = +x, S = -y, W = -x). Apply these checks in order:

1. Target is outside the grid → blocked: `Blocked by wall`.
2. Target cell is an Obstacle → blocked: `Blocked by obstacle`.
3. Two or more robots target the same cell → the lowest `displayId` wins and the others are blocked: `Blocked by "R<ID>"` (the winner).
4. Two robots target each other's cells (swap) → both blocked: `Blocked by "R<ID>"` (the other robot).
5. Target is occupied at the start of the tick:
   - If the occupant moves out successfully this tick, the move succeeds.
   - If the occupant stays (no move, or its move is blocked) → blocked: `Blocked by "R<ID>"` (the occupant). Blocks cascade down a chain.
6. A closed cycle of robots (e.g. 4 robots in a loop, each moving into the next one's cell) → all succeed.

- Each block reason is returned in the tick response.

## FLOOR

- `width` and `height` are ints, each defaulting to 5.
- No floor in the DB → create one. A floor exists → update its width and height from the params.

## OBSTACLE

- Requires int `x` and `y`. Missing → ignored.
- Sets `obstacle = true` on the cell with that x/y. No matching cell → ignored.

## PLACE

- Requires `rId`, int `x`, int `y`, and `direction`.
- `direction` is `NORTH` / `EAST` / `SOUTH` / `WEST` (uppercase), mapped to the `Direction` enum in
  `apps/web/src/app/models/direction.ts` (0 N, 1 E, 2 S, 3 W).
- Find the robot by `displayId`:
  - Found → move it to the cell at x/y and set its direction.
  - Not found → create it on the cell at x/y with that direction.
- Missing or invalid params, or no cell at x/y → ignored.

## TICK

- `amount` is an int, defaulting to 1.
- Calls the Engine's `step()` `amount` times.

## REPORT

- Print the robot report to stdout, using the shared formatter. The format is defined once, under Report format in `log-entry.md`.

## Testing

Every behavioral rule above has at least one test. Add or change a rule → add or change its test.

Engine / queue (`step()` / `doNext()` specs):

- Queue head is consumed FIFO, one command per robot per tick.
- LEFT: N→W→S→E→N. RIGHT: N→E→S→W→N. Persisted.
- MOVE off the grid → `Blocked by wall`, no change.
- MOVE into an Obstacle → `Blocked by obstacle`, no change.
- Two robots → same cell: lower `displayId` moves; the other gets `Blocked by "R<winner>"`.
- Swap → both blocked, each with `Blocked by "R<other>"`.
- Chain into a cell being vacated → both move.
- Chain into a stayer → blocked with `Blocked by "R<occupant>"`, cascading down the chain.
- 4-robot closed loop → all move.
- New cells and directions are persisted.

Service / DTO specs:

- `RId` parsing: `R3` → 3. `r3`, `3`, `R`, `Rx` → ignored with a descriptive message.
- Each endpoint's ignored cases → 400 with a descriptive message, nothing changed.
- LEFT / RIGHT / MOVE / QUEUE enqueue the right command. QUEUE enqueues multiple commands in order; it rejects the whole request if any command is lowercase or unknown.
- FLOOR: defaults to 5×5; creates when missing; updates when present.
- OBSTACLE: sets `obstacle = true`; missing x/y or no cell → ignored.
- PLACE: creates a new robot; updates the cell and direction of an existing `displayId`; accepts only uppercase direction names.
- TICK: defaults to 1; calls `step()` `amount` times.
- REPORT: prints the shared report (format tests live in `log-entry.md`).
