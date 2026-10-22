# Plan: path-scoped rules file for the floor Grid component

## Context
The floor `Grid` component (`apps/web/src/app/components/grid/`) is currently presentational: `App` (`apps/web/src/app/app.ts`) holds a hardcoded local 5x5 floor and passes it in. The user wants a rules file that defines how the Grid is structured and how it responds to input: it should load or create the persisted floor, provide size sliders, and handle resizing, including relocating robots and showing an error. This task only writes the rule. Implementing it comes later.

## Files
1. **Create** `.claude/rules/floor-grid.md`
2. **Edit** `CLAUDE.md` → "Rules files" list: add `floor-grid.md` — `apps/web/src/app/components/grid/**`
3. **Append** an entry to `AI_USAGE.md` (≤500 chars)
4. **Copy** this plan to `.claude/plans/floor-grid-rules.md` (repo root)

## Content of `.claude/rules/floor-grid.md`
```markdown
---
paths:
  - "apps/web/src/app/components/grid/**"
---

# Floor grid component rules

## Coordinates
- Floor width and height are integers from 1 to 20 inclusive. Default is 5 for both.
- Origin (0,0) is the bottom-left cell, unlike native CSS top-left flow.
- X grows to the east (right). Y grows to the north (up). Render the top row (y = height - 1) first.

## Ownership
- Grid owns the floor state: it injects `SimulationApiService`, loads the floor,
  renders the size sliders, and saves changes. `App` does not pass the floor in.

## Initial load
- On init, `GET /floors`. If the list is empty, `POST /floors` with width 5 and height 5.
  Otherwise use the first floor returned and set the UI (sliders and grid) to its values.

## Size sliders
- One numeric slider (range input, min 1, max 20, step 1) for each axis: width and height.
- Save on release (`change` event), not on every `input` event: `PATCH /floors/:id`
  with the new width/height. The sizes persist in SQLite across reloads and server restarts.

## Resize behavior (enforced by the API on PATCH /floors/:id; client does not orchestrate)
- Growing: an Open cell is created for each new coordinate.
- Shrinking: cells outside the new bounds are deleted. Robots on those cells move
  to the nearest Open cell inside the new bounds that has no robot on it.
  Nearest = Manhattan distance from the robot's old position; ties go to lowest y, then lowest x.
- When several robots are displaced, move them in ascending robot Id order;
  each one claims its cell before the next is placed.
- If there is no room for every displaced robot, the API rejects the resize and changes nothing.

## Resize error
- When the resize is rejected, snap the sliders and the grid back to the last saved size.
- Show the message exactly: `Can't resize grid, not enough space for existing robots`
- Display it inline in red text, below the grid and above the movement controls.
- The error has an X button that dismisses it.

## Testing
Every behavioral rule above has at least one test. Add or change a rule → add or change its test.
Client tests go in `grid.spec.ts` (Vitest, mock `SimulationApiService`). API tests go in
`apps/api/src/floor/floor.service.spec.ts`, plus `apps/api/test/` e2e for persistence.

Client (`grid.spec.ts`):
- Sliders have min 1, max 20, step 1 and default to 5 before the floor loads.
- Renders bottom-left as (0,0): the first rendered row is y = height - 1, and x increases left to right.
- Init with an empty `GET /floors` → `POST /floors` called with width 5, height 5; UI shows 5x5.
- Init with an existing floor → no POST; sliders and grid show that floor's width/height.
- Slider `input` event does not call PATCH; `change` event calls `PATCH /floors/:id` once with the new values.
- Rejected PATCH → sliders and grid revert to the last saved size.
- Rejected PATCH → the exact error text appears, in red, below the grid and above the movement controls.
- Clicking the error's X removes the error.

API (`floor.service.spec.ts`):
- Width/height outside 1–20 are rejected (DTO validation).
- Grow → an Open cell exists for every new coordinate; existing cells are unchanged.
- Shrink → cells outside the new bounds are deleted.
- Shrink → a displaced robot moves to the nearest free Open cell by Manhattan distance.
- Manhattan tie → lowest y, then lowest x wins.
- Target excludes Obstacle cells and cells that already have a robot.
- Multiple displaced robots → placed in ascending Id order, each claiming its cell first.
- Not enough room → the error is returned, and floor, cells and robots are all unchanged.

API e2e (`apps/api/test/`):
- PATCHed width/height are returned by `GET /floors` after an app restart (new app instance, same DB file).
```

## Addendum: edit mode
User added edit mode behavior. The Edit button lives in `App` (`apps/web/src/app/app.html`), outside the Grid rule's path, so this goes in a **new** rule file instead of `floor-grid.md`.

Decisions (user):
- Button text: `Edit: On` / `Edit: Off`.
- Lock icons: inline SVG with `currentColor`, no icon package. Off → locked, On → unlocked.
- Obstacle toggles persist via the existing `PATCH /cells/:id`.
- Update the rule file as well as this plan.

Defaults chosen (not stated by user): red `#e03131` and orange `#f08c00` (Excalidraw palette, already used in the app); icon left of the text; `App` owns `editMode` and passes it down; cell updates after the PATCH succeeds.

Files:
1. **Create** `.claude/rules/edit-mode.md`, paths `app.*`, `components/button/**`, `components/grid/**`, `components/cell/**`. Rules: state ownership, cell clicks toggle Obstacle in edit mode (persisted), obstacle = solid red fill, borders black (off) / orange (on), button text + lock icon + orange border when on. Test list for `app.spec.ts`, `grid.spec.ts`, `cell.spec.ts`.
2. **Edit** `CLAUDE.md` "Rules files" list: add `edit-mode.md`.
3. **Append** an `AI_USAGE.md` entry.

Robot cells (user): a cell with a robot on it cannot become an Obstacle. In edit mode, the client ignores the click (no PATCH), and the API rejects `obstacle: true` on a cell with a robot, leaving it unchanged. Tests: `grid.spec.ts` (no PATCH) and `apps/api/src/cell/cell.service.spec.ts` (rejected).

## Verification
- Open a file under `apps/web/src/app/components/grid/` in a new session and confirm the rule loads (`/memory` or ask Claude which rules are active).
- `npm run format` passes on the markdown (Prettier) — or check it is unchanged.
- Re-read the rule against the user's stated behaviors: range 1–20, default 5, bottom-left origin, X east / Y north, sliders, load-or-create, persist on change, grow/shrink, robot order, error text, color, position, and dismiss.
- Check that every behavior bullet maps to at least one test bullet in the Testing section.
- Note: writing the tests themselves is part of the later implementation, not this task.
