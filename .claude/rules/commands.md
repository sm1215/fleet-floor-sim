---
paths:
  - "apps/api/**"
---

# Command rules

## Identity

- Robots have a `displayId` column, separate from the internal primary key `id`.
- Commands act on the active floor (`timeline.md`). `displayId` is unique per floor.
- Commands identify robots by `RId`: uppercase `R` + an integer (e.g. `R3`). Parse the integer as `displayId`.
- `RId` without a leading uppercase `R` or a valid integer → ignored (see Ignored requests).

## Endpoints

One `POST /commands/<name>` route per command. Params come in the body and are validated by a DTO. Then the route calls the matching Engine method (`engine.md`). All command logic lives in the Engine. Robot command routes (LEFT / RIGHT / MOVE / QUEUE / GOTO) only enqueue.

- Success → `200 { ok: true }`. The web refetches the state that changed.
- Only the FLOOR, OBSTACLE, PLACE, QUEUE, GOTO and DELETE routes exist so far. LEFT / RIGHT / MOVE / TICK / REPORT have no route yet; the web enqueues through `/commands/queue`.

| Command  | Route                     | Params                                          |
| -------- | ------------------------- | ----------------------------------------------- |
| LEFT     | `POST /commands/left`     | `rId`                                           |
| RIGHT    | `POST /commands/right`    | `rId`                                           |
| MOVE     | `POST /commands/move`     | `rId`                                           |
| FLOOR    | `POST /commands/floor`    | `width` (int, default 10), `height` (int, default 8) |
| OBSTACLE | `POST /commands/obstacle` | `x` (int, required), `y` (int, required)        |
| PLACE    | `POST /commands/place`    | `rId` (optional), `x` (int), `y` (int), `direction` |
| QUEUE    | `POST /commands/queue`    | `rId`, `commands` (one or more of `LEFT` / `RIGHT` / `MOVE`) |
| GOTO     | `POST /commands/goto`     | `rId`, `x` (int), `y` (int)                     |
| DELETE   | `POST /commands/delete`   | `rId`                                           |
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

## GOTO

- Requires `rId`, int `x` and int `y`. Enqueues `GOTO` with params `x,y` (e.g. `3,4`) on the robot's FIFO queue.
- Unknown robot, non-int x/y, or no cell at x/y → ignored.
- An Obstacle or occupied target is still enqueued; the robot gives up after 3 no-path ticks (`pathfinding.md`).
- Not a QUEUE command: QUEUE accepts only `LEFT` / `RIGHT` / `MOVE`.

## Tick execution

Each Engine `step()` (`apps/api/src/engine`, see `engine.md`) calls `doNext()` (`apps/api/src/queue`, see `queue.md`) and executes the commands it returns. Per tick:

1. `doNext()` returns one promise per robot, in `displayId` order, each resolving to its head command (FIFO) or `null`; the head is deleted from the queue, except a `GOTO` head, which stays (`queue.md`).
2. `GOTO`: the robot is planned by pathfinding (`pathfinding.md`): it may turn for free and join the tick's MOVEs, finish, wait, or give up.
3. `LEFT`: rotate counter-clockwise in place, `(d + 3) % 4`. `RIGHT`: rotate clockwise in place, `(d + 1) % 4`.
4. All `MOVE`s (including GOTO moves) are resolved together (below). Robots that are not moving this tick stay in their cells.
5. Persist every new direction and cell to the DB.

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

- `width` and `height` are ints, defaulting to 10 and 8. The scenario runner's `FLOOR` defaults to 5×5 instead (`scenario-runner.md`).
- No active floor → create one and make it active. Otherwise → update the active floor's width and height from the params.

## OBSTACLE

- Requires int `x` and `y`. Missing → ignored.
- Toggles the cell with that x/y between Open and Obstacle. No matching cell → ignored.
- Toggling ON a cell with a robot → ignored.

## PLACE

- Requires int `x`, int `y`, and `direction`. `rId` is optional.
- No `rId` → create a new robot whose `displayId` is the highest `displayId` on the active floor + 1 (1 when it has no robots).
- `direction` is `NORTH` / `EAST` / `SOUTH` / `WEST` (uppercase), mapped to the `Direction` enum in
  `apps/web/src/app/models/direction.ts` (0 N, 1 E, 2 S, 3 W).
- With `rId`, find the robot by `displayId`:
  - Found → move it to the cell at x/y and set its direction.
  - Not found → create it on the cell at x/y with that direction.
- Missing or invalid params, or no cell at x/y → ignored.

## DELETE

- Requires `rId`. Removes the robot and its queued commands.
- Unknown robot → ignored.

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
- FLOOR: defaults to 10×8; creates when missing; updates when present.
- Success → `200 { ok: true }`.
- OBSTACLE: toggles Open ↔ Obstacle; ON a robot's cell, missing x/y or no cell → ignored.
- PLACE: creates a new robot; updates the cell and direction of an existing `displayId`; accepts only uppercase direction names.
- PLACE without `rId`: `displayId` = max + 1 (R1, R3 → R4); no robots → 1.
- GOTO: enqueues `GOTO` with params `x,y` and logs `QUEUE R1 GOTO 3,4`; an Obstacle or occupied target is still enqueued; unknown robot or no cell → ignored, nothing inserted or logged; e2e missing `x` or `rId: 'r1'` → 400.
- DELETE: removes the robot and its queue; unknown robot → ignored.
- TICK: defaults to 1; calls `step()` `amount` times.
- REPORT: prints the shared report (format tests live in `log-entry.md`).
