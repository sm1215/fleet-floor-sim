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
- `GET /robots` includes each robot's cell x/y.

## Placement (enforced by both client and API)

- Edit mode off: clicking an empty cell sends `POST /robots { cellId, direction: North }`
  through `SimulationApiService`. The robot renders with the returned Id.
- Clicking an Obstacle or occupied cell is ignored: no POST.
- Robots can't be placed outside the grid.
- The API returns 400 for an Obstacle or occupied cell and creates nothing.
- A failed `POST /robots` renders nothing and shows `Robot failed to place.` (see Errors in `frontend.md`).

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

- Turn Left / Turn Right / Move → `POST /queued-commands { robotId, command }` with
  `LEFT` / `RIGHT` / `MOVE` (uppercase).
- ArrowLeft / ArrowRight / ArrowUp do the same while a robot is selected.
- API: `COMMANDS` = `['MOVE', 'LEFT', 'RIGHT']`. `params` is optional on `CreateQueuedCommandDto`.

## Delete

- A Delete button sits after Move, enabled only while a robot is selected. No keyboard shortcut, no confirmation.
- Click → `DELETE /robots/:id` with the selected robot's Id. Allowed while the engine is playing.
- The API deletes the robot's queued commands and the robot in one transaction.
- Success → the robot leaves the grid; if it is still selected, the selection and queue panel clear.
- Failure → nothing changes and `Robot failed to delete.` shows (see Errors in `frontend.md`).

## Queue panel

- Selecting a robot sends `GET /robots/:id/queued-commands` and shows the result in FIFO order (ascending Id).
- A successful POST appends the returned command to the panel.
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

- Empty cell click (edit off) → `POST /robots` with cellId + North, then renders `R<id>` with `^`.
- Obstacle cell click → no POST.
- Occupied cell click → no POST.
- `POST /robots` fails → no robot renders and `Robot failed to place.` is emitted.
- Init `GET /robots` → robots render at their cell x/y with their direction.
- Robot click in edit mode → selects it; no `PATCH /cells`.
- Robot click in non-edit mode → selects it; no `POST /robots`.
- `removeRobot(id)` → that robot is no longer rendered; others stay.

Client (`app.spec.ts`):

- No selection → Move / Turn Left / Turn Right / Delete disabled, and arrow keys send nothing.
- Delete → `DELETE /robots/:id` for the selected robot; it leaves the grid; selection and queue clear.
- Delete success after switching robots → the new selection stays.
- Delete failure → robot stays selected, queue unchanged, `Robot failed to delete.` shown.
- Select a robot, click it again to deselect, click another to switch.
- Buttons and arrow keys POST the matching uppercase command with the selected robot's Id.
- Selecting a robot → `GET /robots/:id/queued-commands`; commands shown in order.
- POST success → returned command appended to the panel.
- POST failure → panel unchanged and `Command failed to queue.` shown.

Client (`queue-panel.spec.ts`):

- Renders commands in the given order.

API (`robot.service.spec.ts`):

- Create on an Obstacle cell → rejected; nothing created.
- Create on an occupied cell → rejected; nothing created.
- `findAll` includes each robot's cell x/y.
- `remove` deletes the robot and only its queued commands.

API (queued-command service spec / DTO):

- `LEFT`, `RIGHT`, `MOVE` accepted.
- `TURN_LEFT`, lowercase (`left`), and unknown commands rejected.
- Missing `params` accepted.
- `GET /robots/:id/queued-commands` returns only that robot's commands, ascending Id.

API e2e (`apps/api/test/`):

- A created robot is returned by `GET /robots` with its cell and direction after an app restart
  (new app instance, same DB file).
- `DELETE /robots/:id` on a robot with queued commands → 200; gone from `GET /robots`, its queue is empty.
