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
- Each entry belongs to a floor (`floor_id`) and has a `tick` (the floor's `currentTick` when written; see `timeline.md`). Reset clears only that floor's log.

## When to log

Write one entry after each successful state change. Ignored or failed requests are not logged (see Ignored requests in `commands.md`).

The Engine logs every successful command it executes (FLOOR, OBSTACLE, PLACE, QUEUE, DELETE) and each tick, in-process via `LogEntryService`. Controllers don't log.

- Every change goes through `POST /commands/*`. The resource routes are read-only and limited to what the web uses: `GET /floors`, `/cells`, `/robots`, `/robots/:id/queued-commands` and `/log-entries`. The other writes are Reset (`POST /floors/:id/reset`, clears that floor's log), Fork, Delete Floor and floor selection (`timeline.md`); none writes an entry. A fork copies the source's entries up to its tick.

- No change is saved without its entry. Each entry is written in the same DB transaction, under the write lock, as the change it records. If the entry fails to write, the change rolls back and the command throws (500 over HTTP).
- Entries are therefore in the order the changes were saved: a tick never logs between a command and its entry.

| Action     | Logged when                       | `params`                                              |
| ---------- | --------------------------------- | ----------------------------------------------------- |
| `PLACE`    | A robot is placed or moved        | `rId`, x, y, direction, e.g. `R1 2, 3, NORTH`         |
| `OBSTACLE` | A cell's obstacle state changes   | x, y, and whether it was toggled on or off, e.g. `2, 3, ON` |
| `QUEUE`    | Commands are enqueued (QUEUE, LEFT, RIGHT, MOVE) | `rId` and the commands in order, e.g. `R1 MOVE` or `R1 MOVE LEFT` |
| `DELETE`   | A robot is deleted                | `rId`, e.g. `R1`                                      |
| `FLOOR`    | The floor is created or resized   | width, height, and created or resized, e.g. `5, 5, CREATED` |
| `TICK`     | A tick completes                  | the tick number                                       |

- `action` is the command name from the table.
- `params` is the params as text.
- `result` is `OK`, or for `TICK` the tick report (below).

## Tick logging

- The Engine writes the `TICK` entry itself, in-process via `LogEntryService`, after each `step()`. Not over HTTP, and there is no tick-log endpoint.
- Step, TICK, and Play ticks are all logged.
- The `TICK` result is the report lines joined with `\n` (`EMPTY` with no robots).
- When the Engine's `scenarioMode` is `true` (set by the scenario runner), every log write is skipped, commands and ticks. A scenario run writes no entries.

## Report format

This is the single source for the robot report. The `TICK` result and the REPORT command (`commands.md`) both use it, through one shared formatter in code.

- One line per robot, sorted by ascending `displayId`: `${RId} ${X},${Y},${DIRECTION}` (no spaces after commas), e.g. `R1 2,3,NORTH`.
  - `RId` = `R${displayId}`. X/Y come from the robot's cell. DIRECTION is the uppercase name (`NORTH` / `EAST` / `SOUTH` / `WEST`), the same names PLACE accepts.
- No robots → `EMPTY`.

## API

- `GET /log-entries?floorId=` returns that floor's entries, ordered by ascending `id`. `floorId` is required (missing → 400).

## Frontend

- Each time the Log modal opens, it calls `GET /log-entries?floorId=` for the viewed floor and shows one line per entry, in `id` order: `${action} ${params}: ${result}`, with `whitespace-pre-line` so multi-line TICK results break.
- The modal's close button is an `X` styled to match `app-button` (border, colors, hover), with `cursor-pointer`.

## Testing

Every behavioral rule above has at least one test. Add or change a rule → add or change its test.

API:

- PLACE, OBSTACLE (on and off), QUEUE, DELETE, and FLOOR (created and resized) each write one entry with the right `action`, `params`, and `result`.
- Ignored requests write no entry.
- A failed entry write rolls back its command (each of FLOOR, OBSTACLE, PLACE, QUEUE, DELETE) or its whole tick.
- A tick requested while a command's entry is being written logs after that entry.
- `scenarioMode` set to `true` → no entry for commands or ticks.
- POST / PATCH / DELETE on the resource routes, and the removed reads (`GET /<resource>/:id`, `GET /queued-commands`) → 404 and nothing changes (`crud.e2e-spec.ts`).
- `step()` writes a `TICK` entry whose params is the tick number and whose result is the report joined with `\n`, sorted by `displayId`.
- `step()` with no robots writes `EMPTY`.
- `step()` with `scenarioMode` set to `true` writes no entry.
- The report formatter produces the exact line format and `EMPTY`. It is shared by REPORT and `TICK`.
- `GET /log-entries?floorId=` returns only that floor's entries in ascending `id` order.

Web:

- Opening the Log modal requests the log and renders one line per entry, in order, as `${action} ${params}: ${result}`.
- The close button shows `X`, has `cursor-pointer`, and closes the modal.
