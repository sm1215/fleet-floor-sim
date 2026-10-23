---
paths:
  - "apps/web/src/app/components/robot/**"
  - "apps/web/src/app/components/grid/**"
  - "apps/web/src/app/components/cell/**"
  - "apps/web/src/app/components/queue-panel/**"
  - "apps/web/src/app/app.*"
  - "apps/web/src/app/services/simulation-api.service.ts"
  - "apps/web/src/app/models/direction.ts"
  - "apps/web/src/app/models/robot.model.ts"
---

# Robot component rules

## Identity

- Display ID is uppercase `R` + the robot's `displayId` column (e.g. `R12`). `displayId` is separate from the primary key Id (see `commands.md`).

## Direction

- The mapping lives in `apps/web/src/app/models/direction.ts`: 0 = N, 1 = E, 2 = S, 3 = W.
- The value comes from the entity's `Direction`.
- New robots face North.

## Position

- x/y come from the robot's cell (`xPosition`/`yPosition`) and are read-only.
- `GET /robots?floorId=` returns that floor's robots, with each robot's cell x/y.

## Placement (enforced by both client and API)

- Edit mode off, no robot selected: clicking an empty Open cell sends `POST /commands/place { x, y, direction: 'NORTH' }`
  (no `rId`) through `SimulationApiService`. On success, `GET /robots` refetches and the robot renders.
- Clicking an Obstacle or occupied cell is ignored: no POST.
- Robots can't be placed outside the grid.
- The API returns 400 for an Obstacle or occupied cell and creates nothing.
- A failed `POST /commands/place` renders nothing and shows `Robot failed to place.` (see Errors in `frontend.md`).

## Move selected robot

- Edit mode off, robot selected: clicking an empty Open cell sends `POST /commands/place { rId, x, y, direction }`
  with the robot's `R<displayId>`, the new x/y and its current direction. On success, `GET /robots` refetches;
  the robot shows on the new cell and stays selected.
- Obstacle or occupied cell → no request.
- Failure → nothing moves and `Robot failed to place.` shows.

## Persistence

- On load, `GET /robots` renders every stored robot on its cell with its direction,
  after both a page reload and an API restart.

## Appearance

- A `border-box` square with a border and background.
- A centered arrow: `^` / `>` / `v` / `<` for N / E / S / W.
- The ID is centered at the bottom.
- Arrow and ID use the border color.

## Selection

- Clicking a robot selects it, in edit mode and non-edit mode.
- One robot at a time: clicking another robot moves the selection; clicking the selected robot deselects it.
- The click does not reach the cell: no placement, no obstacle toggle.
- A selected robot uses the selected border (see Styles).

## Commands

- Turn Left / Turn Right / Move → `POST /commands/queue { rId, commands: [command] }` with
  `LEFT` / `RIGHT` / `MOVE` (uppercase) and the selected robot's `R<displayId>`.
- ArrowLeft / ArrowRight / ArrowUp do the same while a robot is selected.
- API: `COMMANDS` = `['MOVE', 'LEFT', 'RIGHT']`. Queued commands are stored with `params: null`.

## Delete

- A Delete button sits after Move, enabled only while a robot is selected. No keyboard shortcut, no confirmation.
- Click → `POST /commands/delete { rId }` with the selected robot's `R<displayId>`. Allowed while the engine is playing.
- The API deletes the robot's queued commands and the robot in one transaction.
- Success → the robot leaves the grid; if it is still selected, the selection and queue panel clear.
- Failure → nothing changes and `Robot failed to delete.` shows (see Errors in `frontend.md`).

## Queue panel

- Selecting a robot sends `GET /robots/:id/queued-commands` and shows the result in FIFO order (ascending Id).
- A successful POST refetches `GET /robots/:id/queued-commands` into the panel.
- A failed POST leaves the panel unchanged and shows `Command failed to queue.` (see Errors in `frontend.md`).

## Styles

Tailwind classes. Change them here and in the template together.

| Purpose             | Class              |
| ------------------- | ------------------ |
| Sizing              | `box-border`       |
| Border width        | `border-2`         |
| Border (unselected) | `border-blue-900`  |
| Border (selected)   | `border-green-300` |
| Background          | `bg-blue-200`      |
| Arrow + ID text     | `text-blue-900`    |

## Testing

Every behavioral rule above has at least one test. Add or change a rule → add or change its test.
Client tests use Vitest and mock `SimulationApiService`.

Client (`robot.spec.ts`):

- ID renders as `R12` (uppercase R).
- Arrow per direction: `^` N, `>` E, `v` S, `<` W.
- `direction.ts` values: 0 N, 1 E, 2 S, 3 W.
- x/y are read-only inputs taken from the cell.
- Style classes from the Styles table are present.
- Arrow is centered; ID is centered at the bottom.
- Arrow and ID use the text color class.
- Selected → `border-green-300` replaces `border-blue-900`.

Client (`grid.spec.ts`):

- Empty cell click (edit off, nothing selected) → `POST /commands/place` with x/y + `NORTH`, no `rId`; then `GET /robots` and render.
- Empty cell click (edit off, robot selected) → `POST /commands/place` with its `rId`, x/y and current direction; then `GET /robots`; it stays selected.
- Obstacle cell click → no POST.
- Occupied cell click → no POST.
- `POST /commands/place` fails → nothing changes and `Robot failed to place.` is emitted.
- Init `GET /robots` → robots render at their cell x/y with their direction.
- Robot click in edit mode → selects it; no `POST /commands/obstacle`.
- Robot click in non-edit mode → selects it; no `POST /commands/place`.
- `removeRobot(id)` → that robot is no longer rendered; others stay.

Client (`app.spec.ts`):

- No selection → Move / Turn Left / Turn Right / Delete disabled, and arrow keys send nothing.
- Delete → `POST /commands/delete` with the selected robot's `rId`; it leaves the grid; selection and queue clear.
- Delete success after switching robots → the new selection stays.
- Delete failure → robot stays selected, queue unchanged, `Robot failed to delete.` shown.
- Select a robot, click it again to deselect, click another to switch.
- Buttons and arrow keys `POST /commands/queue` with the matching uppercase command and the selected robot's `rId`.
- Selecting a robot → `GET /robots/:id/queued-commands`; commands shown in order.
- POST success → the panel is refetched.
- POST failure → panel unchanged and `Command failed to queue.` shown.

Client (`queue-panel.spec.ts`):

- Renders commands in the given order.

API (`robot.service.spec.ts`, `queued-command.service.spec.ts`; the only robot reads are `GET /robots` and `GET /robots/:id/queued-commands`):

- `findAll` includes each robot's cell x/y.
- `GET /robots/:id/queued-commands` returns only that robot's commands, ascending Id.

Placement, commands and delete rules are tested on the Engine and `/commands/*` (see Testing in `commands.md`).

API e2e (`apps/api/test/robot.e2e-spec.ts`):

- PLACE on an Obstacle, occupied or missing cell → 400; nothing created.
- A placed robot is returned by `GET /robots` with its cell and direction after an app restart
  (new app instance, same DB file).
- `POST /commands/delete` on a robot with queued commands → 200; gone from `GET /robots`, its queue is empty.
