---
paths:
  - "apps/api/**"
  - "apps/web/src/app/components/log-modal/**"
  - "apps/web/src/app/app.*"
  - "apps/web/src/app/services/simulation-api.service.ts"
---

# Log entry rules

## Location

- Entries are `LogEntry` rows (`action`, `params`, `result`), written through `LogEntryService` (`apps/api/src/log-entry`).
- There is no floor FK. Only one floor exists at a time, and Reset clears the log.

## When to log

Write one entry after each successful state change. Ignored or failed requests are not logged (see Ignored requests in `commands.md`).

User interactions are logged in the HTTP controllers only:

| Action     | Logged when                       | `params`                                              |
| ---------- | --------------------------------- | ----------------------------------------------------- |
| `PLACE`    | A robot is placed or moved        | `rId`, x, y, direction, e.g. `R1 2, 3, NORTH`         |
| `OBSTACLE` | A cell's obstacle state changes   | x, y, and whether it was toggled on or off, e.g. `2, 3, ON` |
| `QUEUE`    | A command is enqueued (QUEUE, LEFT, RIGHT, MOVE) | `rId`, the command, and its params if it has any, e.g. `R1 MOVE` |
| `DELETE`   | A robot is deleted                | `rId`, e.g. `R1`                                      |
| `FLOOR`    | The floor is created or resized   | width, height, and created or resized, e.g. `5, 5, CREATED` |
| `TICK`     | A tick completes                  | the tick number                                       |

- `action` is the command name from the table.
- `params` is the params as text.
- `result` is `OK`, or for `TICK` the tick report (below).

## Tick logging

- The Engine writes the `TICK` entry itself, in-process via `LogEntryService`, after each `step()`. Not over HTTP, and there is no tick-log endpoint.
- Step, TICK, and Play ticks are all logged.
- When the Engine's `scenarioMode` is `true` (set by the scenario runner), tick logging is skipped. A scenario run writes no entries.

## Report format

This is the single source for the robot report. The `TICK` result and the REPORT command (`commands.md`) both use it, through one shared formatter in code.

- One line per robot, sorted by ascending `displayId`: `${RId} ${X},${Y},${DIRECTION}` (no spaces after commas), e.g. `R1 2,3,NORTH`.
  - `RId` = `R${displayId}`. X/Y come from the robot's cell. DIRECTION is the uppercase name (`NORTH` / `EAST` / `SOUTH` / `WEST`), the same names PLACE accepts.
- No robots → `EMPTY`.

## API

- `GET /log-entries` returns every entry, ordered by ascending `id`.

## Frontend

- Each time the Log modal opens, it calls `GET /log-entries` and shows one line per entry, in `id` order.
- The modal's close button is an `X` styled to match `app-button` (border, colors, hover), with `cursor-pointer`.

## Testing

Every behavioral rule above has at least one test. Add or change a rule → add or change its test.

API:

- PLACE, OBSTACLE (on and off), QUEUE / LEFT / RIGHT / MOVE, DELETE, and FLOOR (created and resized) each write one entry with the right `action`, `params`, and `result`.
- Ignored requests write no entry.
- `step()` writes a `TICK` entry whose result is the report, sorted by `displayId`.
- `step()` with no robots writes `EMPTY`.
- `step()` with `scenarioMode` set to `true` writes no entry.
- The report formatter produces the exact line format and `EMPTY`. It is shared by REPORT and `TICK`.
- `GET /log-entries` returns all entries in ascending `id` order.

Web:

- Opening the Log modal requests the log and renders one line per entry, in order.
- The close button shows `X`, has `cursor-pointer`, and closes the modal.
