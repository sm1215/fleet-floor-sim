---
paths:
  - "apps/api/database/**"
  - "apps/api/**/*.entity.ts"
---

# Database rules (SQLite + TypeORM)

- Entities mirror `diagrams/fleet-floor-db-entities_v1.excalidraw`. Do not add fields or relationships that are not drawn.
- FK ownership: Cell → Floor (`floor_id`), Robot → Cell (`cell_id`), QueuedCommand → Robot (`robot_id`). LogEntry has no FK.
- `Robot.Direction` is an int: 0 = N, 1 = E, 2 = S, 3 = W (see `src/shared/types.ts`).
- Cell has `Unique(floor_id, XPosition, YPosition)`.
- Schema changes only via migrations in `apps/api/database/migrations/`. `synchronize: false`, always.
- Never edit a migration that has already been run; create a new one.
