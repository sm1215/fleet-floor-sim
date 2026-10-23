---
paths:
  - "apps/api/database/**"
  - "apps/api/**/*.entity.ts"
---

# Database rules (SQLite + TypeORM)

- Entities mirror `diagrams/fleet-floor-db-entities_v1.excalidraw`. Do not add fields or relationships that are not drawn.
- FK ownership: Cell → Floor (`floor_id`), Robot → Cell (`cell_id`), QueuedCommand → Robot (`robot_id`). LogEntry → Floor (`floor_id`), TickHistory → Floor (`floor_id`).
- `Robot.Direction` is an int: 0 = N, 1 = E, 2 = S, 3 = W (see `src/shared/types.ts`).
- Cell has `Unique(floor_id, XPosition, YPosition)`.
- LogEntry has a `tick` column (int): the floor's `currentTick` when written (`timeline.md`).
- TickHistory (`tick_history`): `tick`, `state` (JSON), `Unique(floor_id, tick)`.
- `Robot.display_id` is unique per floor, enforced by the Engine (no DB constraint).
- Schema changes only via migrations in `apps/api/database/migrations/`. `synchronize: false`, always.
- Never edit a migration that has already been run; create a new one.
