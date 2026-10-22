---
paths:
  - "apps/queue/**"
---

# Queue rules

## Location

- The queue lives in `apps/queue`.

## doNext()

- `doNext()` returns a promise.
- Retrieves all robots from the DB, in ascending `displayId` order.
- For each robot, takes its next queued command (FIFO: lowest queued-command Id) from the DB.
- Robots with an empty queue are skipped.
- Parses each command and returns it in the result, in the same `displayId` order: the robot plus its parsed command (`LEFT` / `RIGHT` / `MOVE`).
- `doNext()` does not execute commands. The Engine's `step()` calls it and executes the returned commands (see `engine.md` and `commands.md`).
- A command that fails to parse is left out of the result.
- Each command that is taken is deleted from the DB whether it later succeeds or fails, including commands that fail to parse.

## Testing

Every behavioral rule above has at least one test. Add or change a rule → add or change its test.

`doNext()` spec:

- Returns a promise.
- Results are in ascending `displayId` order, even when that differs from primary key order.
- Only each robot's oldest queued command is returned; the rest stay queued.
- Robots with an empty queue are not in the result.
- `LEFT` / `RIGHT` / `MOVE` are parsed and returned with their robot.
- A command that fails to parse is not in the result.
- Every command taken is deleted from the DB, including one that fails to parse.
