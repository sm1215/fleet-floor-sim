# Plan: add `.claude/rules/log-entry.md`
Source: `.claude/plans/log-entry-plan.md`.

## Decisions (from user)
- Log scope: `GET /log-entries` returns all entries ordered by ascending `id`. No floor FK (only one floor exists; Reset clears the log).
- User interactions are logged in the HTTP controllers only, so scenario runs do not log them.
- Tick results are logged directly by the Engine: after each `step()` it writes a LogEntry in-process through `LogEntryService`. No HTTP and no tick-log endpoint. Step, TICK and Play ticks log.
- Scenario mode: the Engine has a `scenarioMode` boolean (default `false`). The scenario runner sets it to `true` before running. When it is `true`, the Engine skips tick logging, so a scenario run writes no LogEntries.
- Logged actions: robot placed, obstacle toggled, command queued, tick result, plus robot deleted and FLOOR create/resize.
- Ignored or failed requests are not logged.
- The per-robot report format moves to `log-entry.md`. commands.md REPORT and the tick log both point to it, and one shared formatter in code serves both.
- Entry layout: `action` = command name (e.g. `PLACE`); `params` = the params as text (e.g. `R1 2, 3, NORTH`); `result` = `OK`, or for TICK the report lines.

## Steps
1. Create `.claude/rules/log-entry.md`, scoped to `apps/api/**`, `apps/web/src/app/components/log-modal/**`, `apps/web/src/app/app.*` and `apps/web/src/app/services/simulation-api.service.ts`. Contents:
   - When to write a LogEntry, each after a successful state change:
     - PLACE: `rId`, x, y, direction.
     - OBSTACLE: x, y, and whether it was toggled on or off.
     - QUEUE (and LEFT / RIGHT / MOVE enqueues): `rId`, the command, and its params if it has any.
     - DELETE robot: `rId`.
     - FLOOR: width, height, created or resized.
     - TICK: tick number, then one line per robot sorted by ascending `displayId` (`${RId} ${X}, ${Y}, ${Direction}`). No robots → `EMPTY`.
   - Entry layout (above). Ignored or failed requests are not logged.
   - Report format: the single source for the per-robot line and `EMPTY`.
   - Tick logging: the Engine writes it directly via `LogEntryService` after each `step()`, not over HTTP. Skipped when `scenarioMode` is `true`.
   - Frontend: the Log button calls `GET /log-entries` each time the modal opens and shows one line per entry, in id order.
   - Close button: an `X` styled to match `app-button` (border, colors, hover), with `cursor-pointer`.
   - Testing section: one test per rule, like the other rules files.
2. `commands.md`: REPORT points to the report format in `log-entry.md`, with no duplicated format text.
3. `engine.md`: add `scenarioMode` (boolean, default `false`) to State. After `step()`, the Engine logs the tick result via `LogEntryService` unless `scenarioMode` is `true` (see `log-entry.md`).
4. `CLAUDE.md`: add `log-entry.md` to the Rules files list.
