# fleet-floor-sim

## Ground rules
- Do not make assumptions. If something is unclear, or there is more than one reasonable option, ask.
- Ask before installing packages, changing config files, or committing.
- Ignore `DECISIONS.md`.
- Log brief summaries of prompts and decisions made in `AI_USAGE.md`. Keep each entry to 500 characters or less.
- Save a copy of every plan made to this project's local `.claude/plans/` folder (repo root), in addition to wherever plan mode saves it by default.

## Project overview
A lightweight robot fleet floor simulator, built quickly. The Excalidraw diagrams in `diagrams/` are the source of truth:
- `fleet-floor-system-overview_v1.excalidraw` — system architecture
- `fleet-floor-interface-layout_v1.excalidraw` — client UI layout
- `fleet-floor-db-entities_v1.excalidraw` — database entities

### System
- Angular client ↔ NestJS API over HTTP.
- The API drives the **Engine**, which reads/writes the SQLite DB.
- The scenario runner calls the Engine directly ("Direct Run"), not over HTTP.
- Each robot has a FIFO command queue. The simulation is tick-based.
- User interactions and tick results are appended to a log history.

### Interface
- Grid: default 10 x 8 (width x height), max width 20, max height 20, origin at 0,0.
- Cells are Open or Obstacle. Robots show their ID and a direction arrow.
- **Edit mode**: clicking a cell toggles it between Open and Obstacle.
- **Non-edit mode**: clicking a cell places a robot.
- Controls (only enabled when a robot is selected): Move, Turn Left, Turn Right — also bound to arrow keys. Delete removes the selected robot (button only).
- Step, Play / Pause.
- Per-robot queue panel showing queued commands (FIFO).
- Log button opens a modal with the full text history of user interactions and tick results.

### Entities
Only what is drawn in the diagram is stated here. Do not invent fields or relationships.

| Entity        | Fields                                          |
| ------------- | ----------------------------------------------- |
| Floor         | Id (PK), Height, Width                          |
| Cell          | Id (PK), Obstacle, XPosition, YPosition         |
| Robot         | Id (PK), Direction (Int)                        |
| QueuedCommand | Id (PK), Command, Params                        |
| LogEntry      | Id (PK), Action, Params, Result, Tick           |
| TickHistory   | Id (PK), Tick, State                            |

- FK ownership: Cell → Floor (`floor_id`), Robot → Cell (`cell_id`), QueuedCommand → Robot (`robot_id`), LogEntry → Floor (`floor_id`), TickHistory → Floor (`floor_id`). TickHistory has `Unique(floor_id, Tick)`. LogEntry.Tick, TickHistory and their Floor FKs are not in the diagram yet (added for the timeline, `timeline.md`).
- Cell has `Unique(floor_id, XPosition, YPosition)`.
- `Direction` is an int: 0 = N, 1 = E, 2 = S, 3 = W. Origin is bottom-left; N = +y.

## Tech stack
- **Database**: SQLite + TypeORM
- **Backend**: NestJS
- **Frontend**: Angular
- **Lint/format**: ESLint (flat config) + Prettier for all JS/TS
- **Tests**: Vitest.
  - **API**: set up. Nest 12 scaffolds Vitest by default (Vite 8 transform, no SWC). SWC is not used: its native addon fails on this machine's drive ACLs.
  - **Web**: Angular 22 unit-test builder (`@angular/build:unit-test`) with Vitest, the `ng new` default. `ng test --watch=false` runs once.

## Commands
npm workspaces (`apps/*`), run from the repo root. Status says which exist so far.

| Command | Purpose | Status |
| --- | --- | --- |
| `npm run dev:api` | Run the API in dev mode (own terminal) | Exists |
| `npm run dev:web` | Run the client in dev mode (own terminal) | Exists |
| `npm run build` | Build all workspaces | Exists |
| `npm run test` | Run tests | Exists |
| `npm run lint` | Lint all JS/TS | Exists |
| `npm run format` | Format with Prettier | Exists |
| `npm run db:migrate` | Run pending migrations | Exists |
| `npm run db:migrate:generate -- database/migrations/<name>` | Generate a migration from entity changes | Exists |
| `npm run db:migrate:revert` | Revert the last migration | Exists |
| `npm run scenario -- path/to/scenario.txt` | Run a scenario file (builds the API first) | Exists |

API-only: `npm run test:e2e -w apps/api` runs the e2e tests (`apps/api/test/`).

### Scenario runner
- Standalone script in `apps/api/`, separate from the dev server.
- Loads a **plain-text** scenario file given as a CLI argument: `npm run scenario -- path/to/scenario.txt`.
- Runs the scenario against the Engine directly. Starts on a 5 x 5 floor (its own default, not the interface's 10 x 8).
- Builds into `apps/api/dist-scenario/` first (own tsconfig, so `dist/` is never wiped), then runs `dist-scenario/src/scenario/main.js`. Use `npm run -s scenario -- …` to keep npm's banner lines off stdout.
- Scenario file format and behavior: see `.claude/rules/scenario-runner.md`. Examples in `scenarios/`, expected REPORT output in `scenarios/expected/`.

## Folder structure
```
apps/web/                   Angular client
apps/api/                   NestJS API, scenario runner
apps/api/database/migrations/  TypeORM migrations
apps/api/src/engine/        Engine (tick loop, step)
apps/api/src/queue/         Queue (doNext: next command per robot)
apps/api/src/pathfinding/   Pathfinding (GOTO first step, pure BFS)
diagrams/                   Excalidraw diagrams (source of truth)
.claude/rules/              Path-scoped rules for Claude
```
SQLite file location: `apps/api/data/fleet.sqlite`, set via `DB_PATH` in `apps/api/.env` (see `.env.example`).

## Coding standards
- TypeScript `strict` mode.
- ESLint flat config + Prettier; code must pass both.
- Naming: `PascalCase` for classes/types, `camelCase` for variables/functions, `kebab-case` file names (e.g. `robot.service.ts`).
- Keep modules small and focused.
- No speculative abstractions — this is a quick build. Write what is needed now.

## Key patterns & conventions
- **NestJS layering**: module → controller → service. Controllers handle HTTP only; logic lives in services.
- **DTO validation** on all incoming request bodies.
- **TypeORM entities** mirror the DB entities diagram.
- **Schema changes only via migrations** in `apps/api/database/migrations/`. `synchronize: false`, always.
- **Engine** is callable both through the API (HTTP) and directly by the scenario runner — keep it independent of HTTP concerns.
- **Command queue**: FIFO, one per robot.
- **Tick-based engine**: state advances one tick at a time (Step, or continuously via Play).
- **Angular**: standalone components.

## Rules files
Path-scoped rules in `.claude/rules/` load when working on matching files:
- `backend.md` — `apps/api/**`
- `commands.md` — `apps/api/**`
- `database.md` — `apps/api/database/**`, `apps/api/**/*.entity.ts`
- `frontend.md` — `apps/web/**`
- `floor-grid.md` — `apps/web/src/app/components/grid/**`
- `edit-mode.md` — `apps/web/src/app/app.*`, `components/button/**`, `components/grid/**`, `components/cell/**`
- `robot-rules.md` — `apps/web/src/app/app.*`, `components/robot/**`, `components/grid/**`, `components/cell/**`, `components/queue-panel/**`, `services/simulation-api.service.ts`, `models/direction.ts`, `models/robot.model.ts`
- `engine.md` — `apps/api/src/engine/**`
- `queue.md` — `apps/api/src/queue/**`
- `pathfinding.md` — `apps/api/src/pathfinding/**`, `src/engine/**`
- `scenario-runner.md` — `apps/api/src/scenario/**`, `scenarios/**`
- `timeline.md` — `apps/api/src/history/**`, `src/engine/**`, `src/floor/**`, `apps/api/database/**`, `apps/web/src/app/components/timeline/**`, `components/grid/**`, `app.*`, `services/simulation-api.service.ts`
- `log-entry.md` — `apps/api/**`, `apps/web/src/app/components/log-modal/**`, `apps/web/src/app/app.*`, `services/simulation-api.service.ts`
