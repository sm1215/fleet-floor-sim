---
paths:
  - "api/database/**"
  - "api/**/*.entity.ts"
---

# Database rules (SQLite + TypeORM)

- Entities mirror `diagrams/fleet-floor-db-entities_v1.excalidraw`. Do not add fields or relationships that are not drawn.
- FK ownership (`floor_id`, `cell_id`, `robot_id`) is not decided yet — ask before modelling relations.
- `Robot.Direction` is a plain int. Do not assign an encoding.
- Cell has `Unique(floor_id, XPosition, YPosition)`.
- Schema changes only via migrations in `api/database/migrations/`. `synchronize: false`, always.
- Never edit a migration that has already been run; create a new one.
