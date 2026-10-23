---
paths:
  - "apps/web/src/app/app.*"
  - "apps/web/src/app/components/button/**"
  - "apps/web/src/app/components/grid/**"
  - "apps/web/src/app/components/cell/**"
---

# Edit mode rules

## State

- `App` owns `editMode` (boolean, default off). The Edit button at the top of the page toggles it.
- `App` passes `editMode` to Grid as an input; Grid passes it on to each Cell.

## Cell clicks

- Edit mode on: clicking a cell toggles it between Open and Obstacle.
- The toggle persists: Grid calls `POST /commands/obstacle { x, y }` through `SimulationApiService`;
  the Engine toggles the cell. Flip the cell in the UI only after the request succeeds.
- A cell with a robot on it cannot become an Obstacle. In edit mode, clicking it does nothing (no request).
- The API enforces this too: OBSTACLE on a cell with a robot is ignored (400) and nothing changes.
- Edit mode off: a cell click does not change Open/Obstacle (it places a robot; covered elsewhere).

## Cell appearance

- An Obstacle cell is filled solid red (`#e03131`), the whole cell.
- An Open cell has no fill.
- Cell borders are black when edit mode is off and orange (`#f08c00`) when it is on.

## Edit button

- Text: `Edit: Off` when edit mode is off, `Edit: On` when it is on.
- Lock icon left of the text, as inline SVG with `stroke="currentColor"` so it matches the text color.
  No icon package.
  - Edit mode off: locked padlock.
  - Edit mode on: unlocked padlock.
- Border is orange (`#f08c00`) when edit mode is on; the normal button border when off.

## Testing

Every rule above has at least one test.

`app.spec.ts`:

- Edit button starts as `Edit: Off` with the locked icon and the normal border.
- Clicking it → `Edit: On`, unlocked icon, orange border. Clicking again → back to off.
- The icon uses `currentColor`.

`grid.spec.ts` (mock `SimulationApiService`):

- Edit mode on, cell click → `POST /commands/obstacle` with the cell's x/y; the cell flips after success.
- Request fails → the cell is unchanged.
- Edit mode off, cell click → no obstacle request.
- Edit mode on, click a cell with a robot → no request; the cell is unchanged.

`apps/api/src/engine/direct-commands.service.spec.ts`:

- OBSTACLE ON a cell with a robot → ignored; the cell is unchanged.

`cell.spec.ts`:

- Obstacle cell has the red fill; Open cell has none.
- Border is black with edit mode off and orange with it on.
