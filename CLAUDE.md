# fleet-floor-sim

## Ground rules
- Do not make assumptions. If something is unclear, or there is more than one reasonable option, ask.
- Ask before installing packages, changing config files, or committing.
- Ignore `DECISIONS.md`.
- Log brief summaries of prompts and decisions made in `AI_USAGE.md`.

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
- Grid: default 5 x 5, max width 20, max height 20, origin at 0,0.
- Cells are Open or Obstacle. Robots show their ID and a direction arrow.
- **Edit mode**: clicking a cell toggles it between Open and Obstacle.
- **Non-edit mode**: clicking a cell places a robot.
- Controls (only enabled when a robot is selected): Move, Turn Left, Turn Right — also bound to arrow keys.
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
| LogEntry      | Id (PK), Action, Params, Result                 |

- FK columns `floor_id`, `cell_id`, and `robot_id` exist. **Which entity owns each FK is not decided yet — ask.**
- Cell has `Unique(floor_id, XPosition, YPosition)`.
- `Direction` is a plain int. Its encoding is not defined — do not assign one.

## Tech stack
- **Database**: SQLite + TypeORM
- **Backend**: NestJS
- **Frontend**: Angular
- **Lint/format**: ESLint (flat config) + Prettier for all JS/TS
- **Tests**: Vitest — deferred. Install only after NestJS and Angular exist, then run a smoke test for both.
  - **Before installing NestJS**: check whether the Nest CLI will set up Jest by default, then stop and ask how to proceed.
  - **Before installing Angular**: check whether the Angular CLI will set up Jest (or another runner) by default, then stop and ask how to proceed.

## Commands
npm workspaces, run from the repo root. **None of these exist yet — to be created.**

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run API and client in dev mode |
| `npm run build` | Build all workspaces |
| `npm run test` | Run tests |
| `npm run lint` | Lint all JS/TS |
| `npm run format` | Format with Prettier |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:migrate:generate` | Generate a migration from entity changes |
| `npm run db:migrate:revert` | Revert the last migration |
| `npm run scenario -- path/to/scenario.txt` | Run a scenario file |

### Scenario runner
- Standalone script in `api/`, separate from the dev server.
- Loads a **plain-text** scenario file given as a CLI argument: `npm run scenario -- path/to/scenario.txt`.
- Runs the scenario against the Engine directly.
- Scenario file format: to be defined.

## Folder structure
```
web/                        Angular client
api/                        NestJS API, Engine, scenario runner
api/database/migrations/    TypeORM migrations
diagrams/                   Excalidraw diagrams (source of truth)
.claude/rules/              Path-scoped rules for Claude
```
SQLite file location: to be decided.

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
- **Schema changes only via migrations** in `api/database/migrations/`. `synchronize: false`, always.
- **Engine** is callable both through the API (HTTP) and directly by the scenario runner — keep it independent of HTTP concerns.
- **Command queue**: FIFO, one per robot.
- **Tick-based engine**: state advances one tick at a time (Step, or continuously via Play).
- **Angular**: standalone components.

## Rules files
Path-scoped rules in `.claude/rules/` load when working on matching files:
- `backend.md` — `api/**`
- `database.md` — `api/database/**`, `api/**/*.entity.ts`
- `frontend.md` — `web/**`
