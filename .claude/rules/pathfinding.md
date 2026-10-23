---
paths:
  - "apps/api/src/pathfinding/**"
  - "apps/api/src/engine/**"
---

# Pathfinding rules (GOTO)

## Command

- `GOTO x,y` sends a robot to the cell at x/y along a shortest path.
- Stored as `QueuedCommand { command: 'GOTO', params: 'x,y' }`. No schema change.
- Enqueued through `POST /commands/goto` (`commands.md`). The scenario runner has no GOTO: a `GOTO` line is an unknown keyword.
- It stays at the head of the robot's queue until the robot arrives or gives up. Commands queued behind it wait.

## Location

- `apps/api/src/pathfinding/find-first-step.ts`: `findFirstStep(start, target, floor, isWall)`, a pure function with no DB or Nest.
- The Engine (`engine.md`) calls it once per GOTO robot per tick, through `EngineCommandsService.gotoSteps()`, which reads the floor's obstacles and robots once per tick for every GOTO.

## findFirstStep()

- BFS over the grid, outward from `target`. Returns the `Direction` of the first step of a shortest path from `start`.
- Walls: cells outside the grid (never passed to `isWall`), Obstacle cells, and every other robot's cell, using positions at the start of the tick. The robot's own cell (`start`) is never a wall.
- Several first steps with equally short paths → prefer NORTH, EAST, SOUTH, WEST, in that order. A shorter path always beats the tie order.
- No path (target outside the grid, a wall, or enclosed) → `null`. `start` equals `target` → `null`.

## Per tick (Engine)

GOTO heads are planned in `displayId` order, before the tick's MOVEs are resolved.

1. **Already on the target** → the GOTO finishes this tick and is removed. The robot does not move or turn.
2. **Path found** → the robot turns to face the first step (free, part of the same tick) and makes a normal MOVE. It joins the tick's `moveAll`, so every MOVE rule in `commands.md` applies (walls, obstacles, lower `displayId` wins, swaps, chains).
   - The MOVE succeeds onto the target → the GOTO finishes and is removed this tick.
   - The MOVE is blocked → the robot stays (still facing the step) and the GOTO stays.
3. **No path** → the robot waits (no move, no turn) and the GOTO stays.

- A tick with a path (found, whether or not the MOVE is blocked) resets the robot's no-path count.
- On the **3rd** no-path tick in a row, the GOTO is removed and an `UNREACHABLE` entry is logged (params `R1 3, 4`, result `OK`), inside the tick's transaction, before the `TICK` entry. Skipped in `scenarioMode`; the GOTO is still removed.
- The robot's next queued command runs on the following tick.

## No-path counter

- In memory in the Engine, per floor, keyed by queued-command id. An API restart resets it.
- Rebuilt every tick from the GOTOs that tick sees, so a deleted robot or removed GOTO leaves no entry.
- Committed only with the tick: a tick that rolls back changes no count and removes no GOTO.
- `reset(floorId)` clears that floor's counts.

## Timeline

- Snapshots, replay and Fork keep GOTO with its target (`timeline.md`).

## Testing

Every behavioral rule above has at least one test. Add or change a rule → add or change its test.

`find-first-step.spec.ts`:

- One straight-line case per direction (N, E, S, W).
- Ties: N over E, E over S, S over W.
- Detour around an obstacle wall. A shorter path beats the tie order. The only open route is taken.
- Target is a wall, enclosed, or outside the grid → `null`. `start === target` → `null`.
- `isWall` is never called for out-of-bounds positions.

`engine-goto.spec.ts` (SQLite):

- The floor is read once per tick, however many robots run a GOTO.
- Two-tick walk: the GOTO stays after tick 1 and is removed on arrival.
- Turn and move in one tick. Tie-break picks N.
- Already on target: removed, no move; the next command runs the tick after.
- Another robot's cell is a wall.
- No path: waits 2 ticks; on tick 3 removed and `UNREACHABLE` logged before `TICK`; the next command runs on tick 4.
- A tick with a path resets the streak.
- A GOTO MOVE competing for a cell: wins with the lower `displayId`; loses → stays facing the step, GOTO kept.
- `scenarioMode`: no `UNREACHABLE` entry, GOTO still removed on tick 3.
- A deleted robot leaves no counter entry.
- `reset()` clears the counter.

`engine-logging.spec.ts`:

- A failed TICK write on the 3rd no-path tick keeps the GOTO and the count; the next tick is the 3rd.
