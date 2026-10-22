# Plan: add `.claude/rules/commands.md`

## Context
`.claude/plans/command-plan.md` defines the robot and floor commands (LEFT, RIGHT, MOVE, FLOOR, OBSTACLE, PLACE, QUEUE, TICK, REPORT). Each one becomes an API endpoint, and the Engine (in `apps/engine`) resolves the commands tick by tick. This step only writes those behaviors into a path-scoped rules file, so that later work on the API and Engine follows them. No code changes.

## Decisions (from Q&A)
- Routes: one `POST /commands/<name>` per command, with params validated by a DTO.
- Robot ids: every command takes an `RId` (`R<n>`). `<n>` is parsed into the new `displayId` column. robot-rules.md is updated to match.
- LEFT/RIGHT/MOVE endpoints **enqueue**. The Engine's Step applies them from each robot's FIFO queue. Moves are resolved together within each tick.
- Invalid or ignorable requests: never throw in a way that stops the program. The service/Engine returns a descriptive result (what was ignored and why). Over HTTP this is a 400 with that message, and nothing changes. The scenario runner logs the message and continues.
- MOVE block reasons are returned in the tick response.
- PLACE Direction strings: `NORTH`/`EAST`/`SOUTH`/`WEST`, mapped to the `Direction` enum in `apps/web/src/app/models/direction.ts`.
- REPORT prints to stdout, as the command plan says. You didn't pick a response body for it, so the rules file says stdout only.
- "Lower numerical ID wins" means lower `displayId`.

## Files
1. **Create `.claude/rules/commands.md`**, using the same format as `robot-rules.md` (frontmatter `paths:`, then sections, then Testing):
   - `paths`: `apps/api/**`, `apps/engine/**`, `apps/queue/**` (Step execution goes through `doNext()` per engine.md)
   - Sections: Identity (RId/displayId, separate from PK), Endpoints table, Ignored requests, then one section per command (LEFT, RIGHT, MOVE + tick resolution rules + block reasons `Blocked by wall` / `Blocked by obstacle` / `Blocked by "R<ID>"`, FLOOR, OBSTACLE, PLACE, QUEUE, TICK, REPORT format `${RId} ${X}, ${Y}, ${Direction}` / `EMPTY`).
   - Step order per robot: take the head of the queue. LEFT/RIGHT rotate in place (counter-clockwise: (d+3)%4, clockwise: (d+1)%4). All MOVEs are resolved together: wall, then obstacle, then contested target (lowest displayId wins), then swap (both blocked), then occupied-by-a-stayer (blocked, cascading), then closed cycles (all succeed). Results are persisted.
   - Testing section: at least one test per rule. Engine spec cases cover every MOVE rule (wall, obstacle, contest, swap, chain into a vacating cell, chain into a stayer, 4-robot loop). Service/DTO specs cover RId parsing, defaults (FLOOR 5×5, TICK 1), the ignored-request messages, PLACE upsert, and the REPORT output plus `EMPTY`.
2. **Edit `.claude/rules/robot-rules.md` Identity section**: the display ID is `R` + `displayId` (a separate column from the PK Id), and is no longer derived from the DB Id.
3. **Edit `CLAUDE.md` "Rules files" list**: add `commands.md` (`apps/api/**`, `apps/engine/**`).
4. Save a copy of this plan to `.claude/plans/` in the repo, and add a short entry (500 characters or less) to `AI_USAGE.md`.

## Verification
- Re-read `commands.md` against every bullet in `command-plan.md`, checking that each is covered and has a test listed.
- Check that the frontmatter `paths` glob syntax matches the other rules files.
- Nothing to run, since only docs change.
