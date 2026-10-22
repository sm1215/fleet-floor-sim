---
paths:
  - "apps/api/src/engine/**"
---

# Engine rules

## Location

- The engine lives in `apps/api/src/engine` as the NestJS `EngineService`.

## State

- `currentTick`: number, starts at `0`, increments by `1`.
- `tickRate`: number in milliseconds, defaults to `1000`.
- `running`: boolean.

## step()

- `step()` increments `currentTick` by `1`.
- `step()` calls `doNext()` on `QueueService` (`apps/api/src/queue`), awaits the returned array and every promise in it, and executes the commands they resolve to (see `queue.md` and `commands.md`).
- `step()` waits until all promises resolve.
- Commands are applied in-process by `EngineCommandsService` (not over HTTP, and not the `POST /commands/*` routes, which enqueue): `left(robotId)` and `right(robotId)` per robot, then one `moveAll(robotIds)` with every `MOVE` of the tick so moves resolve together. The MOVE rules live in the pure `resolveMoves()` (`resolve-moves.ts`).
- `moveAll()` returns the block reasons; where they are reported is not decided yet.
- If an error occurs, report it back to the frontend, where it is displayed under the grid.

## Running

- When `running` is `true`, the engine calls `step()` automatically every `tickRate` ms.
- Pausing and resuming while a step is pending never starts a second timer: at most one step per `tickRate`.
- A manual step while `running` is rejected: the API returns 400 (`Cannot step while the simulation is running. Pause it first.`) and nothing steps. The client disables the Step button while running.

## API endpoints

- An endpoint to call `step()` manually.
- An endpoint to toggle `running` on and off.
