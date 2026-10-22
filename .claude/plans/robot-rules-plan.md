# Plan: robot-rules.md

## Context
The robot web component needs a path-scoped rules file listing its rules, constraints and behaviors, and every rule needs a test that proves it. This task writes rules only, no code (same as floor-grid.md). The error display rules move out of floor-grid.md into frontend.md so the grid and the robot commands share them.

User decisions: rules + test list only. API commands become `LEFT`/`RIGHT`/`MOVE`. Tailwind classes go in a Styles section. Placement is enforced by both client and API. `params` becomes optional. Clicking a robot toggles selection, one robot at a time, in both modes, without toggling its cell. Queue loads via `GET /robots/:id/queued-commands`; a queued command is appended after the POST succeeds; a failed POST shows `Command failed to queue.` `GET /robots` returns cell x/y. Errors stack (max 50px, scrolls) and get a clear-all button when there's more than one.

## Files
1. **Create** `.claude/rules/robot-rules.md` (content below).
2. **Edit** `.claude/rules/frontend.md`: add an `## Errors` section and a `## Testing` section for it.
3. **Edit** `.claude/rules/floor-grid.md`: replace the "Resize error" display bullets with the message plus "shown per Errors in `frontend.md`". Move the generic display tests (red, position, X) to frontend.md and keep the test for the exact message text.
4. **Edit** `CLAUDE.md` Rules files list: add `robot-rules.md` and its paths.
5. **Append** an `AI_USAGE.md` entry (≤500 chars).
6. **Copy** this plan to `.claude/plans/robot-rules-plan.md`.

## robot-rules.md content

Frontmatter paths: `components/robot/**`, `components/grid/**`, `components/cell/**`, `components/queue-panel/**`, `app.*`, `services/simulation-api.service.ts`, `models/direction.ts`, `models/robot.model.ts` (all under `apps/web/src/app/`).

Sections:
- **Identity**: display ID is uppercase `R` + database Id (e.g. `R12`).
- **Direction**: the mapping lives in `apps/web/src/app/models/direction.ts` (0 N, 1 E, 2 S, 3 W) and comes from the entity's `Direction`. New robots face North.
- **Position**: x/y come from the cell's `xPosition`/`yPosition` and are read-only. `GET /robots` includes each robot's cell x/y.
- **Placement**: edit mode off, clicking an empty cell sends `POST /robots { cellId, direction: North }` through `SimulationApiService`, and the robot renders with the returned Id. Obstacle or occupied cell → ignored, no POST. Robots can't be placed outside the grid. The API returns 400 for an Obstacle or occupied cell and creates nothing.
- **Persistence**: on load, `GET /robots` renders every stored robot on its cell with its direction, after both a reload and an API restart.
- **Appearance**: a `border-box` square with a border and background. A centered arrow `^`/`>`/`v`/`<` for N/E/S/W. The ID centered at the bottom. Arrow and ID use the border color.
- **Selection**: clicking a robot selects it in either mode. One at a time: clicking another robot moves the selection, clicking the selected robot deselects it. The click doesn't reach the cell (no placement, no obstacle toggle). Selected robots use the selected border.
- **Commands**: Turn Left/Turn Right/Move → `POST /queued-commands { robotId, command }` with `LEFT`/`RIGHT`/`MOVE` (uppercase). ArrowLeft/ArrowRight/ArrowUp do the same while a robot is selected. API `COMMANDS` = `['MOVE','LEFT','RIGHT']`, and `params` is optional on `CreateQueuedCommandDto`.
- **Queue panel**: selecting a robot sends `GET /robots/:id/queued-commands` and shows the result in FIFO order (ascending Id). A successful POST appends the returned command. A failed POST leaves the panel unchanged and shows `Command failed to queue.` (see frontend.md Errors).
- **Styles** (table, edit here and in the template together): `box-border`, `border-2`, `border-blue-900` (unselected), `border-green-300` (selected), `bg-blue-200`, `text-blue-900` (arrow + ID).
- **Testing**: each rule maps to tests:
  - `robot.spec.ts`: `R12` uppercase. Arrow per direction. direction.ts values. x/y read-only. Style classes. Arrow centered, ID centered at the bottom. Arrow and ID text color. Selected border swap.
  - `grid.spec.ts`: empty cell click → POST with cellId + North, then renders `R<id>` `^`. Obstacle/occupied click → no POST (break tests). Init `GET /robots` renders at cell x/y. Robot click in edit mode → selects, no `PATCH /cells`. Robot click in non-edit mode → selects, no `POST /robots`.
  - `app.spec.ts`: no selection → buttons disabled and keys send nothing. Select/deselect/switch. Buttons and keys POST the right uppercase command with the selected Id. Selecting a robot → GET queue, shown in order. POST success appends. POST failure → panel unchanged + error.
  - `queue-panel.spec.ts`: renders commands in order.
  - API `robot.service.spec.ts`: Obstacle/occupied create rejected and nothing created. `findAll` includes cell x/y.
  - API `queued-command` spec/DTO: `LEFT`/`RIGHT`/`MOVE` accepted. `TURN_LEFT`, lowercase, and unknown commands rejected. No `params` accepted. The per-robot endpoint returns only that robot's commands, ascending Id.
  - API e2e: a created robot comes back from `GET /robots` with its cell and direction after an app restart.

## frontend.md Errors section
- Errors show inline, in red text, below the grid and above the movement controls.
- Errors stack: each new error is added to the list, and each has an X button that dismisses only that error.
- The list has a max height of 50px (`max-h-[50px]`) with a vertical scrollbar (`overflow-y-auto`).
- With more than one error, a `Clear errors` button appears at the bottom right and removes every error.
- Tests (`app.spec.ts`, since the display sits between the grid and the controls in App): red text and position. Two errors both show. X removes only its own error. More than 50px of errors → max-height + overflow classes. `Clear errors` is hidden with one error, shown with two, and empties the list.

## Open choices (resolved)
- Button label: `Clear errors` (user choice).
- Error display tests live in `app.spec.ts` (confirmed).

## Verification
- Rules only, no code. Check that the frontmatter is valid YAML, that every rule bullet has at least one matching test line, and that floor-grid.md no longer duplicates the error display rules.

---

# Execute plan: robot-rules.md (from federated-floating-pudding.md)

## Context
Carry out the plan in `C:\Users\sm121\.claude\plans\federated-floating-pudding.md` (rules and tests only, no code). It adds a robot rules file and moves the error display rules from `floor-grid.md` into `frontend.md` so the grid and the robot commands both use them.

Open choices are now settled: the button label is **`Clear errors`** (not `Clear all`), and the error display tests go in **`app.spec.ts`**.

## Steps
1. **Create** `.claude/rules/robot-rules.md` with the frontmatter paths and sections from the source plan: Identity, Direction, Position, Placement, Persistence, Appearance, Selection, Commands, Queue panel, Styles table, and Testing (per-spec test lists). Match the format of `floor-grid.md`: quoted YAML `paths:` list, `##` sections, short bullets.
2. **Edit** `.claude/rules/frontend.md`: add `## Errors` (inline red text below the grid and above the controls; errors stack, each with its own X; `max-h-[50px]` + `overflow-y-auto`; with more than one error, a `Clear errors` button at the bottom right removes them all) and `## Testing` (in `app.spec.ts`: red text and position, two errors both show, X removes only its own error, max-height/overflow classes, `Clear errors` hidden with one error, shown with two, and empties the list).
3. **Edit** `.claude/rules/floor-grid.md`:
   - In "Resize error", replace lines 44–45 (red text, position, X) with "shown per Errors in `frontend.md`". Keep the snap-back rule and the exact message.
   - In Testing, change line 61 to check only the exact error text, and remove line 62 (the X test, which moves to frontend.md).
4. **Edit** `CLAUDE.md` Rules files list: add `robot-rules.md` with its paths (robot, grid, cell, queue-panel components, `app.*`, `simulation-api.service.ts`, `models/direction.ts`, `models/robot.model.ts`).
5. **Append** an `AI_USAGE.md` entry (≤500 chars) covering the rules file, the error-rule move, and the `Clear errors` + `app.spec.ts` decisions.
6. **Copy** the source plan to `.claude/plans/robot-rules-plan.md` with `Clear all` changed to `Clear errors` and the open choices marked resolved. Also save this plan there per CLAUDE.md.

No commits (CLAUDE.md: ask first).

## Verification
- The robot-rules.md frontmatter is valid YAML (same shape as floor-grid.md).
- Every rule bullet in robot-rules.md and in frontend.md Errors has at least one matching test line.
- floor-grid.md no longer repeats the error display rules (grep for "red text" and "X button" there → none).
- The CLAUDE.md rules list includes robot-rules.md.
