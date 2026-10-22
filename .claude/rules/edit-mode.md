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
- The toggle persists: Grid calls `PATCH /cells/:id` with `{ obstacle: !cell.obstacle }`
  through `SimulationApiService`. Update the cell in the UI only after the PATCH succeeds.
- A cell with a robot on it cannot become an Obstacle. In edit mode, clicking it does nothing (no PATCH).
- The API enforces this too: `PATCH /cells/:id` with `obstacle: true` on a cell with a robot is rejected
  and nothing changes.
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

- Edit mode on, cell click → `PATCH /cells/:id` with the flipped `obstacle`; the cell updates after success.
- PATCH fails → the cell is unchanged.
- Edit mode off, cell click → no obstacle PATCH.
- Edit mode on, click a cell with a robot → no PATCH; the cell is unchanged.

`apps/api/src/cell/cell.service.spec.ts`:

- `obstacle: true` on a cell with a robot → rejected; the cell is unchanged.

`cell.spec.ts`:

- Obstacle cell has the red fill; Open cell has none.
- Border is black with edit mode off and orange with it on.
