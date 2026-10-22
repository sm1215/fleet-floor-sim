# Engine execution plan (2026-10-22)

Builds on `queue-do-next-impl-plan.md`, with these user rulings replacing parts of it:

## User rulings
- Play / Pause button label: `Pause` while running, `Play` while paused.
- After every tick (manual Step or while running), the grid reloads robots and the queue panel reloads the selected robot's queue.
- Engine moves into NestJS (`apps/api/src/engine/`); `apps/engine/` and `apps/queue/` are deleted.
- The engine defines its own functions for LEFT / RIGHT / MOVE that update the DB per `commands.md`. They are not the `POST /commands/*` routes (those enqueue).
- Called in-process, no HTTP. MOVE is one batch call per tick (`moveAll`) so moves resolve together.
- Block reasons: `moveAll` returns them; where they go (response, log, UI) is left for later.
- Config reverted to before the plain-TS engine: API `rootDir` ".", nest-cli `entryFile` `src/main`, `start:prod` `dist/src/main`, no engine/queue globs in lint/format/vitest/tsconfig.build, `.prettierrc` copies and `.gitignore` lines removed, root `"type": "module"` removed.
- From the queue plan (kept): Robot `displayId` (int, unique, NOT NULL, backfilled = id, defaults to id on create, 409 on duplicate); `QueueService.doNext(): Promise<Promise<NextCommand | null>[]>` in `apps/api/src/queue/`.

## Steps
1. Revert config; move Engine into `EngineService` (state, step, toggle, run counter timer).
2. `displayId` column + migration + DTO + service (409).
3. `QueueModule` / `QueueService.doNext()` + spec (SQLite).
4. Engine commands: `left(robot)`, `right(robot)`, `moveAll(robots)` in `apps/api/src/engine/engine-commands.service.ts`; MOVE resolution in a pure `resolveMoves()` (wall, obstacle, contest by lowest displayId, swap, occupancy chain, closed cycles succeed). Specs per `commands.md` Testing.
5. `step()`: `currentTick += 1`, await doNext promises, apply LEFT/RIGHT, then `moveAll` of MOVEs.
6. Web: Play/Pause label; Grid `tick` input reloads robots on change; App reloads queue of the selected robot when `currentTick` changes.
7. Rules/docs: engine.md, queue.md, commands.md paths, CLAUDE.md folders/rules list.
8. Verify: API unit + e2e, web tests, lint, Prettier, build. AI_USAGE entry. No commit.
