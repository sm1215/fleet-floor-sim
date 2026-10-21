## Interface Scaffold Plan

Scaffold the Angular client UI in `apps/web` as standalone components, following
`diagrams/fleet-floor-interface-layout_v1.excalidraw` for the grid position, the button
positions, the queue panel and the robot design. Cell placement in the diagram is
illustrative only.

### Decisions
- **Grid**: default 5 x 5, max 20 x 20. Origin `0,0` is at the **bottom-left** (as in the
  diagram), so x increases to the right and y increases **upward**. Rows render top-down
  from `y = height - 1` to `y = 0`.
- **Direction encoding**: `0 = North (up)`, `1 = East`, `2 = South`, `3 = West`. The robot's
  arrow is rotated `direction * 90deg` from up.
- **Models**: plain TS interfaces in `apps/web`, mirroring the API entities (the API's TypeORM
  entities are not imported).
  - `Robot.x` / `Robot.y` are convenience properties derived from the robot's cell.
- **Responsive layout**: the minimum width is `600px`. On narrow screens the queue panel drops
  below the grid, with `max-height: 200px` and scrolling.
  - Grid cells scale to fit the grid area, so a 20 x 20 grid fits without horizontal scroll.
- **Buttons**: one generic `app-button` (`label`, `disabled` inputs and a `pressed` output).
  The parent decides what each press does, through the handlers listed below.
- **API service**: `SimulationApiService` is created empty, with no methods and no mock data.
  Endpoints are set up after this plan. Until then the grid renders the default 5 x 5 Open
  floor locally, with no robots and an empty queue.
- **Arrow keys**: `ArrowLeft` triggers Turn Left, `ArrowRight` triggers Turn Right,
  `ArrowUp` triggers Move. `ArrowDown` is unbound.
- **Log modal**: an empty box that opens from the Log button and closes with an `X` in the
  top-right corner.
- **Styling**: Tailwind (already installed).
- **Placeholder**: replace the Angular placeholder content in `app.html`.

### Button handlers (to be specified)
Each button gets a named handler in `App`. Mark each one as **API** or **Frontend only**.
Until then, each handler is an empty stub.

| Button       | Handler           | Target (API / Frontend only) |
| ------------ | ----------------- | ---------------------------- |
| Step         | `onStep()`        | API                        |
| Play / Pause | `onPlayPause()`   | API                        |
| Edit         | `onToggleEdit()`  | Frontend                        |
| Log          | `onOpenLog()`     | API / Frontend                        |
| Turn Left    | `onTurnLeft()`    | API / Frontend                        |
| Turn Right   | `onTurnRight()`   | API / Frontend                        |
| Move         | `onMove()`        | API / Frontend                        |

### Out of scope
- Cell click behaviour (the edit-mode toggle and robot placement) and robot selection.
- Disabling the controls when no robot is selected.
- API calls and mock data.
- **Follow up later**: where client state lives (e.g. a signal-based store service).

### Files
`apps/web/src/app/`
- `models/floor.model.ts`: `Floor { id, height, width }`
- `models/cell.model.ts`: `Cell { id, obstacle, xPosition, yPosition, floorId }`
- `models/robot.model.ts`: `Robot { id, direction, cellId, x, y }` (`x`/`y` are derived from
  the cell)
- `models/queued-command.model.ts`: `QueuedCommand { id, command, params, robotId }`
- `models/log-entry.model.ts`: `LogEntry { id, action, params, result }`
- `models/direction.ts`: the `Direction` enum (N/E/S/W = 0–3)
- `components/button/button.ts|html`: the generic button
- `components/grid/grid.ts|html`: the Floor. Renders cells in bottom-left-origin order and
  marks the origin.
- `components/cell/cell.ts|html`: an Open or Obstacle cell. Optionally hosts a robot.
- `components/robot/robot.ts|html`: an orange-outlined square with a direction arrow
  (rotated by `direction`) and the robot ID underneath, per the diagram.
- `components/queue-panel/queue-panel.ts|html`: "`<RID>` Queue", a FIFO list of
  `QueuedCommand` items
- `components/log-modal/log-modal.ts|html`: an empty modal with an `X` close button
- `services/simulation-api.service.ts`: an empty injectable stub
- `app.ts|html|css`: the layout (top bar: Step, Play / Pause, Edit, Log; grid, with the queue
  panel to its right or below it; bottom bar: Turn Left, Turn Right, Move), the button
  handlers, and the arrow-key `@HostListener`
- Each component gets a matching `*.spec.ts`. Replace the placeholder `app.spec.ts`.

### Docs
- `CLAUDE.md` and `.claude/rules/database.md`: replace "Direction encoding is not defined"
  with the N/E/S/W = 0–3 encoding.
- `AI_USAGE.md`: log the execution summary and decisions.

### Tests (Vitest, via `ng test`)
- Grid: renders `width * height` cells; the cell at `0,0` is bottom-left; renders 20 x 20.
- Cell: applies the obstacle styling when `obstacle` is true.
- Robot: shows the ID; the arrow rotation matches each direction 0–3.
- Button: emits `pressed` on click; does not emit when `disabled`.
- Queue panel: renders commands in FIFO order.
- Log modal: opens from Log; closes on `X`.
- App: the arrow keys call `onTurnLeft` / `onTurnRight` / `onMove`; `ArrowDown` does nothing.

### Verification
1. `npm run build`, `npm run lint`, `npm run test` all pass from the repo root.
2. `npx prettier --check "apps/web/src/**/*.{ts,html,css}"` passes.
3. `npm run dev:web`: visually check the layout against the diagram at a wide width and at
   600px (the queue drops below, capped at 200px, with no horizontal page scroll). Check that
   the log modal opens and closes.
