---
paths:
  - "apps/api/src/queue/**"
---

# Queue rules

## Location

- The queue lives in `apps/api/src/queue` as a NestJS `QueueModule` + `QueueService`.

## doNext()
- Retrieves all robots from the DB, in ascending `displayId` order.
- Returns `Promise<Promise<NextCommand | null>[]>`: a promise of an array with one promise per robot found, in the same `displayId` order.
- Each robot's promise takes its next queued command (FIFO: lowest queued-command Id) from the DB and parses it.
- It resolves to `{ robot, command }`: the robot plus its parsed command (`LEFT` / `RIGHT` / `MOVE`).
- A robot with an empty queue, or whose command fails to parse, resolves to `null`.
- `doNext()` does not execute commands. The Engine's `step()` calls it and executes the returned commands (see `engine.md` and `commands.md`).
- Each command that is taken is deleted from the DB whether it later succeeds or fails, including commands that fail to parse.

## Testing

Every behavioral rule above has at least one test. Add or change a rule → add or change its test.

`doNext()` spec:

- Returns a promise of an array with one promise per robot.
- With no robots in the DB, resolves to an empty array.
- Results are in ascending `displayId` order, even when that differs from primary key order.
- Only each robot's oldest queued command is returned; the rest stay queued.
- A robot with an empty queue resolves to `null`.
- `LEFT` / `RIGHT` / `MOVE` are parsed and returned with their robot.
- A command that fails to parse resolves to `null`.
- Every command taken is deleted from the DB, including one that fails to parse.
