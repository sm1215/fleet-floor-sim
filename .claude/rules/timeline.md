---
paths:
  - "apps/api/src/history/**"
  - "apps/api/src/engine/**"
  - "apps/api/src/floor/**"
  - "apps/api/database/**"
  - "apps/web/src/app/components/timeline/**"
  - "apps/web/src/app/components/grid/**"
  - "apps/web/src/app/app.*"
  - "apps/web/src/app/services/simulation-api.service.ts"
---

# Timeline rules

A scrubber under the grid shows any past tick of the viewed floor, read-only. Past states are rebuilt from snapshots plus log replay. A past tick can be forked into a new floor.

## Floors

- Many floors may exist. The Engine holds one **active floor** (`floorId`), the one the client views.
- Each floor has its own `currentTick`. `GET /engine` returns the active floor's `floorId` and `currentTick`.
- Step / Play act on the active floor only. Commands (`POST /commands/*`) act on the active floor.
- Switching floors (`POST /engine/floor { floorId }`) pauses the engine. Unknown floor → 400 `Floor <id> not found`.
- An automatic tick still waiting for the write lock when the engine pauses (Pause, Fork, floor switch) is dropped, so a paused floor never advances.
- On API start, each floor's `currentTick` = `MAX(log_entry.tick)` for that floor (0 when none). Active = lowest floor id.
- `display_id` is unique per floor (enforced by the Engine, not the DB). PLACE without `rId` = highest displayId on that floor + 1.

## Snapshots

- Table `tick_history` (entity `TickHistory`): `id`, `tick`, `state` (JSON `FloorState`), `floor_id` FK → Floor. `Unique(floor_id, tick)`.
- `EngineService.snapshotFrequency = 10`.
- At the start of each tick, inside the tick's transaction, when `currentTick % snapshotFrequency === 0`, the Engine saves a snapshot labelled `currentTick`. It holds exactly the state at that tick. A failed tick rolls its snapshot back.
- Skipped in `scenarioMode` (no log → nothing to replay).
- `FloorState`: `{ width, height, cells: { x, y, obstacle }[], robots: { id, displayId, x, y, direction, queue: Command[] }[] }`. Cells sorted by y then x; robots by displayId; queues in FIFO order.

## Reconstruction

- Each `log_entry` has a `tick`: the floor's `currentTick` when written. `TICK T` has `tick = T`; a command logged between `TICK T` and `TICK T+1` has `tick = T`.
- State at tick T = the state after `TICK T` plus every command logged before `TICK T+1`. State at `currentTick` is the live state.
- To rebuild T < `currentTick`: load the snapshot with the highest `tick <= T`, then replay that floor's entries with `snapshot.tick < entry.tick <= T` in id order. No snapshot → `No history for tick T` (400).
- Replay is the pure `applyEntry(state, entry)` (`apps/api/src/history/replay.ts`):

| Action | Effect |
| --- | --- |
| `FLOOR w, h, CREATED` | all-Open w×h, no robots |
| `FLOOR w, h, RESIZED` | `planResize()` (same as live); apply creates, deletes and moves |
| `OBSTACLE x, y, ON\|OFF` | set that cell's `obstacle` |
| `PLACE R<d> x, y, DIR` | existing displayId → move and turn; new → `id = max(ids, 0) + 1`, empty queue |
| `QUEUE R<d> CMD…` | append the commands to that robot's queue |
| `DELETE R<d>` | remove the robot and its queue |
| `TICK n` | pop the queue head of every robot with a non-empty queue; set each robot's x/y/direction from the result lines (`EMPTY` → none) |

## Scrubber

- A standalone `Timeline` component (`app-timeline`) directly under the grid.
- Range input: min 0, max `currentTick`, step 1.
- While live (`viewTick` null) it follows `currentTick`. Moving it below max pins it (`viewTick` = value); a rising `currentTick` leaves it where it is. Moving it back to max returns to live.

## Number input

- To the right of the scrubber; shows the same value.
- `input`: a whole number within `0..currentTick` applies at once, the same way as the scrubber.
- `change`: `Math.floor`, then clamp to `0..currentTick`, then apply. Empty / NaN → reset the field to the scrubber value.
- Moving the scrubber updates the number.
- While the number input has focus, a new `currentTick` does not overwrite it; on blur it shows the scrubber value again.

## Read-only

While `viewTick` is not null, the grid shows the past state and nothing can change it.

- Disabled: Step, Play (Pause stays enabled while running), Edit, size sliders, cell clicks, Turn Left / Turn Right / Move / Delete, arrow keys, Reset All, Delete Floor.
- Enabled: scrubber, number input, Fork From Here, floor dropdown, Log, robot selection. The queue panel shows the selected robot's queue at that tick.
- A replayed state's robot ids can differ from live ids, so the web identifies past robots by displayId: each takes the live id of the robot with its displayId, or `-displayId` if it is no longer live. Selecting such a robot and going back to live clears the selection.

## Fork From Here

- A button right of the number input. Forks the viewed floor at the scrubber's tick (`viewTick ?? currentTick`).
- The new floor gets the cells, robots (same displayIds and directions) and queues at that tick, plus copies of the source's log entries and snapshots with `tick <= T`. Its `currentTick` = T. Its history matches the source up to T.
- Fork writes no log entry. The source is unchanged. The engine pauses and the view switches to the new floor, live.
- Failure → `Floor failed to fork.`

## Floor dropdown

- Right of the Fork button. One option per floor, `Floor <id>`, ascending id; the viewed floor is selected.
- Change → `POST /engine/floor`, then the grid shows that floor live; the selection and queue clear.

## Reset All

- Resets only the viewed floor: its cells, robots, queues, log entries and snapshots; its tick → 0. Other floors are untouched.

## Delete Floor

- Button right after `Reset All`. `window.confirm('Delete this floor?')`. No → nothing.
- Yes → `POST /floors/:id/delete`: deletes the floor and its cells, robots, queues, log entries and snapshots. The lowest remaining floor id becomes active. Deleting the last floor creates a new default 5 x 5 floor (logged `FLOOR 5, 5, CREATED`).
- Failure → `Floor failed to delete.`

## API routes

- `GET /engine` → includes `floorId`.
- `POST /engine/floor { floorId: int }` → `EngineState`; ignored → 400 with the reason.
- `GET /floors/:id/history?tick=N` → `FloorState`. Tick must be an int from 0 to that floor's `currentTick`; else 400. Unknown floor → 400.
- `POST /floors/:id/fork { tick: int ≥ 0 }` → `{ floorId }`; ignored → 400.
- `POST /floors/:id/delete` → `EngineState`; unknown → 404.
- `GET /robots?floorId=`, `GET /log-entries?floorId=` (required).
- History reads and forks run under the write lock.

## Testing

API:

- Schema (`timeline-schema.e2e-spec.ts`): shared displayId across floors; duplicate (floor, tick) rejected; `log_entry.floor_id` FK; migration backfills `tick`.
- Floor scoping: PLACE max displayId per floor; QUEUE / DELETE / REPORT per floor; `doNext(floorId)`; every log line has its floorId and tick; `step()` advances only the active floor; `selectFloor()` pauses and switches tick; restart logs `TICK n+1`.
- Replay (`replay.spec.ts`): one test per table row, one head popped per robot per TICK, displaced robot on resize, new robot ids, no mutation.
- Snapshots / history: snapshots at 0, 10, 20 only; none in scenarioMode; rolled back with a failed tick; `stateAt(t)` equals the live state for t = 0..25 across resize, delete and obstacles; no snapshot → null; route validation.
- Fork: live state equals source `stateAt(T)`; history matches; fork of a fork; source unchanged; selects new floor and pauses; no extra log entry.
- Reset / Delete: per-floor reset; delete removes everything on that floor only; active → lowest id; last floor → new 5 x 5.

Web:

- Timeline (`timeline.spec.ts`): min/max/follow, pinned, back to live, range ↔ number sync, number clamp / NaN, focused number not overwritten by a new tick, Fork emits, dropdown.
- Grid: floorId selection, history view, read-only clicks and sliders, live reload, `historyQueue`.
- App: layout, read-only disabled / enabled lists, scrubbing while running, Fork, dropdown, Delete Floor confirm / failure, Reset All scope, history queue.
