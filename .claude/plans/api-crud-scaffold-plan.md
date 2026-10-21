# API CRUD scaffold plan

Derived from `api-scaffold-plan.md`, revised with user decisions (2026-10-21).

## Decisions
- Services use real TypeORM repositories (not hardcoded stubs).
- Entities stay in `apps/api/database/entities/`; feature folders import them.
- FK ownership is taken from the existing entities: Cell→Floor (`floor_id`), Robot→Cell (`cell_id`), QueuedCommand→Robot (`robot_id`). LogEntry has no FK.
- Flat REST routes, full CRUD on each.
- DTO validation: install `class-validator` and `class-transformer`; global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- Tests: colocated unit specs plus supertest e2e in `test/` (existing folder; the original plan said `tests/`).
- Engine placeholders included. Direction is 0=N 1=E 2=S 3=W; origin is bottom-left, N = +y. Command = `'MOVE' | 'TURN_LEFT' | 'TURN_RIGHT'`.
- Migrations: install `tsx` (dev) and run the TypeORM CLI through it.

## Packages (apps/api)
- deps: `class-validator`, `class-transformer`
- devDeps: `tsx`

## Files
```
apps/api/
  database/
    data-source.ts                 # DataSource for the CLI: process.env.DB_PATH (scripts pass Node's --env-file=.env), entities + migrations glob
    migrations/<ts>-init.ts        # generated: floor, cell, robot, queued_command, log_entry
  src/
    main.ts                        # + global ValidationPipe
    app.module.ts                  # register entities, import 5 feature modules
    shared/types.ts                # Direction enum (N=0,E=1,S=2,W=3), Position {x,y}, Command union
    floor/   floor.module.ts, floor.controller.ts, floor.service.ts, dto/{create,update}-floor.dto.ts, *.spec.ts
             floor.model.ts        # pure helpers: inBounds(floor, pos), isObstacle(cells, pos) — stub/throw where logic is TBD
    cell/    cell.module.ts, cell.controller.ts, cell.service.ts, dto/..., *.spec.ts
             cell.model.ts         # toPosition(cell): Position
    robot/   robot.module.ts, robot.controller.ts, robot.service.ts, dto/..., *.spec.ts
             robot.service.ts also gets turnLeft/turnRight/move/reportState placeholders (throw NotImplemented; not exposed over HTTP)
    queued-command/  module, controller, service, dto/..., *.spec.ts
    log-entry/       module, controller, service, dto/..., *.spec.ts
  test/
    crud.e2e-spec.ts               # or one file per entity
```
`floor.model.ts` / `cell.model.ts` hold only plain logic types and helpers, not ORM models.

## Endpoints (each resource)
| Verb | Path | Body |
| --- | --- | --- |
| POST | /floors | `{ height, width }` (int, 1..20) |
| GET | /floors | – |
| GET | /floors/:id | – |
| PATCH | /floors/:id | partial |
| DELETE | /floors/:id | – |

The same shape applies to `/cells` `{ obstacle, xPosition, yPosition, floorId }`, `/robots` `{ direction (0..3), cellId }`, `/queued-commands` `{ command (MOVE|TURN_LEFT|TURN_RIGHT), params, robotId }`, and `/log-entries` `{ action, params, result }`.
- `:id` goes through `ParseIntPipe`. A missing row returns 404 (`NotFoundException`).
- FK ids in the DTOs map to relations (`{ floor: { id: floorId } }`).
- Update DTOs have every field hand-written as `@IsOptional()`. `@nestjs/mapped-types` (`PartialType`) is not installed; installing it is an option.
- No extra validation (bounds, uniqueness) beyond DTO types; the DB unique constraint on Cell surfaces as a 500 for now.

## Tests
- Unit: controller spec per resource with the service mocked (returns stub objects) for all five handlers; service spec with the repo mocked, covering find/404.
- E2E: Nest app with TypeORM pointed at `:memory:`, `migrationsRun: true`; one CRUD round-trip per resource (create → list → get → patch → delete → 404).
- The existing `app.e2e-spec.ts` stays. It needs `DB_PATH`, so the e2e setup sets `DB_PATH=:memory:`.

## Scripts
- apps/api `package.json`: `db:migrate` = `tsx ../../node_modules/typeorm/cli.js migration:run -d database/data-source.ts`, plus `db:migrate:generate` (`migration:generate database/migrations/<name>`, with the name passed after `--`) and `db:migrate:revert`. The typeorm CLI is hoisted to the root `node_modules`.
- root `package.json`: `db:migrate*` forwarding with `-w apps/api`.

## Docs
- CLAUDE.md: replace the "FK ownership not decided" line with the actual ownership, define the Direction encoding, and mark the db:* commands as Exists.
- `.claude/rules/database.md`: update the matching two lines.
- AI_USAGE.md entry.

## Verification
`npm run db:migrate`, `npm run lint`, `npm run build`, `npm run test`, `npm run test:e2e -w apps/api`.

## Out of scope
Engine tick loop, queue processing, scenario runner, log writes on actions, frontend wiring.
