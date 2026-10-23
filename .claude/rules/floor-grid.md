---
paths:
  - "apps/web/src/app/components/grid/**"
---

# Floor grid component rules

## Coordinates

- Floor width and height are integers from 1 to 20 inclusive. Default is 5 for both.
- Origin (0,0) is the bottom-left cell, unlike native CSS top-left flow.
- X grows to the east (right). Y grows to the north (up). Render the top row (y = height - 1) first.

## Axis labels

- Label every row with its y number on the left of the grid, and every column with its x number
  below the grid. Numbering starts at 0 at the origin: row labels run from 0 at the bottom up to
  height - 1; column labels run from 0 at the left to width - 1.
- Labels follow the current size, so a height increase visibly adds new numbered rows at the top.

## Ownership

- Grid owns the floor state: it injects `SimulationApiService`, loads the floor,
  renders the size sliders, and saves changes. `App` does not pass the floor in.

## Initial load

- On init, `GET /floors`. If the list is empty, `POST /commands/floor { width: 5, height: 5 }`, then `GET /floors` again.
  Otherwise use the first floor returned and set the UI (sliders and grid) to its values.

## Size sliders

- One numeric slider (range input, min 1, max 20, step 1) for each axis: width and height.
- Save on release (`change` event), not on every `input` event: `POST /commands/floor`
  with the new width/height, then refetch the floor and its cells. The sizes persist in SQLite across reloads and server restarts.

## Resize behavior (enforced by the API on POST /commands/floor; client does not orchestrate)

- Robots whose cell is still inside the new bounds stay on that cell (same x, y).
- Growing: an Open cell is created for each new coordinate.
- Shrinking: cells outside the new bounds are deleted. Robots on those cells move
  to the nearest Open cell inside the new bounds that has no robot on it.
  Nearest = Manhattan distance from the robot's old position; ties go to lowest y, then lowest x.
- When several robots are displaced, move them in ascending robot Id order;
  each one claims its cell before the next is placed.
- If there is no room for every displaced robot, the API rejects the resize and changes nothing.

## Resize error

- When the resize is rejected (400), snap the sliders and the grid back to the last saved size.
- Show the message exactly: `Can't resize grid, not enough space for existing robots`,
  shown per Errors in `frontend.md`.

## Server error

- Any other failure (load, save, or cell reload; any status other than 400, including no response)
  shows `Server can't be reached`, per Errors in `frontend.md`. A failed save reverts the sliders
  and the grid to the last saved size.
- The new size and its cells show together. A response to an earlier slider release is ignored
  once a newer release has been sent.

## Testing

Every behavioral rule above has at least one test. Add or change a rule → add or change its test.
Client tests go in `grid.spec.ts` (Vitest, mock `SimulationApiService`). API resize tests go in
`apps/api/src/floor/floor-resize.spec.ts` (through the Engine's FLOOR), plus `apps/api/test/` e2e for persistence.

Client (`grid.spec.ts`):

- Sliders have min 1, max 20, step 1 and default to 5 before the floor loads.
- Renders bottom-left as (0,0): the first rendered row is y = height - 1, and x increases left to right.
- Row labels read height - 1 down to 0 (top to bottom); column labels read 0 to width - 1 (left to right).
- After a height increase, the new row labels appear at the top and existing labels keep their numbers.
- Init with an empty `GET /floors` → `POST /commands/floor` called with width 5, height 5, then `GET /floors` again; UI shows 5x5.
- Init with an existing floor → no POST; sliders and grid show that floor's width/height.
- Slider `input` event does not save; `change` event calls `POST /commands/floor` once with the new values.
- Rejected resize (400) → sliders and grid revert to the last saved size.
- Rejected resize (400) → the exact error text appears.
- Non-400 save failure, or a load failure (`GET /floors`, `POST /commands/floor`, `GET /cells`) → `Server can't be reached`.
- After a successful save the grid keeps the old size until the new cells arrive.
- A late response to an earlier release changes nothing.

API (`floor-resize.spec.ts`; size range in `direct-commands.service.spec.ts`):

- Width/height outside 1–20, or not an int → ignored.
- Grow → an Open cell exists for every new coordinate; existing cells are unchanged.
- Shrink → cells outside the new bounds are deleted.
- Resize (grow or shrink) → robots on cells still inside the bounds keep their cell.
- Shrink → a displaced robot moves to the nearest free Open cell by Manhattan distance.
- Manhattan tie → lowest y, then lowest x wins.
- Mixed resize (one axis grows, the other shrinks) → newly created cells are valid targets.
- Target excludes Obstacle cells and cells that already have a robot.
- Multiple displaced robots → placed in ascending Id order, each claiming its cell first.
- Not enough room → ignored with the reason, and floor, cells and robots are all unchanged.

API e2e (`apps/api/test/`):

- A FLOOR resize is returned by `GET /floors` after an app restart (new app instance, same DB file).
