---
paths:
  - "apps/api/src/engine/**"
---

# Engine rules

## Location

- The engine lives in `apps/api/src/engine` as the NestJS `EngineService`.

## State

- `floorId`: the active floor (lowest id on start). Commands and ticks act on it (`timeline.md`).
- `currentTick`: the active floor's tick. Each floor has its own tick, starting at `0` and incrementing by `1`; loaded on start as `MAX(log_entry.tick)` per floor.
- `snapshotFrequency`: `10`. A snapshot is saved at the start of a tick when `currentTick % snapshotFrequency === 0` (not in `scenarioMode`).
- `tickRate`: number in milliseconds, defaults to `1000`.
- `running`: boolean.
- `scenarioMode`: boolean, defaults to `false`. The scenario runner sets it to `true`.

## Commands

- The Engine owns every command in `commands.md`: `floor(width, height)`, `obstacle(x, y)`, `place(displayId | undefined, x, y, direction)`, `queue(displayId, commands)`, `goto(displayId, x, y)`, `delete(displayId)`, `tick(amount)`, and `report()`.
- FLOOR / OBSTACLE / PLACE / QUEUE / GOTO / DELETE write a log entry on success through `log(manager, action, params, result = 'OK')`, inside the command's own transaction (see `log-entry.md`). A failed write rolls the command back. Ignored commands write nothing.
- `log()` is a no-op when `scenarioMode` is `true`.
- LEFT / RIGHT / MOVE are enqueued through `queue()`, GOTO through `goto(displayId, x, y)` (logged as `QUEUE R1 GOTO 3,4`). Nothing is applied until a tick.
- Both callers use these methods: the `POST /commands/*` routes (after DTO validation) and the scenario runner (`scenario-runner.md`).
- Invalid input never throws. The method returns a result saying it was ignored and why (see Ignored requests in `commands.md`).
- No HTTP concerns inside the Engine.

## step()

- `step()` increments `currentTick` by `1` once the tick commits.
- The whole tick (taking queue heads, turns, moves and the `TICK` entry) runs in one DB transaction under the write lock. Any failure rolls it all back and `currentTick` stays where it was.
- `step()` calls `doNext()` on `QueueService` (`apps/api/src/queue`), awaits the returned array and every promise in it, and executes the commands they resolve to (see `queue.md` and `commands.md`).
- `step()` waits until all promises resolve.
- Commands are applied in-process by `EngineCommandsService` (not over HTTP, and not the `POST /commands/*` routes, which enqueue): `left(robotId)` and `right(robotId)` per robot, then one `moveAll(robotIds)` with every `MOVE` of the tick so moves resolve together. The MOVE rules live in the pure `resolveMoves()` (`resolve-moves.ts`).
- GOTO heads are planned first, in `displayId` order, through one `EngineCommandsService.gotoSteps()` call per tick, made only when the tick has GOTOs (`pathfinding.md`): finish, wait/give up, or turn for free and join `moveAll`. After `moveAll`, a GOTO whose MOVE reached its target is removed.
- The no-path counter is in memory (per floor, keyed by queued-command id). The tick builds the next counter and the Engine assigns it only after the transaction commits. `reset(floorId)` clears that floor's counter.
- After the commands are applied, `step()` writes a `TICK` log entry through `log()` (params: the tick number; result: the report joined with `\n`), unless `scenarioMode` is `true` (see `log-entry.md`).
- `moveAll()` returns the block reasons; where they are reported is not decided yet.
- If an error occurs, report it back to the frontend, where it is displayed under the grid.

## Running

- When `running` is `true`, the engine calls `step()` automatically every `tickRate` ms.
- Pausing and resuming while a step is pending never starts a second timer: at most one step per `tickRate`.
- A manual step while `running` is rejected: the API returns 400 (`Cannot step while the simulation is running. Pause it first.`) and nothing steps. The client disables the Step button while running.

## API endpoints

- An endpoint to call `step()` manually.
- An endpoint to toggle `running` on and off.
- `POST /engine/floor { floorId }` to switch the active floor (pauses; see `timeline.md`).
