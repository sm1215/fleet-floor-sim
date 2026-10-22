---
paths:
  - "apps/web/**"
---

# Frontend rules (Angular)

- Use standalone components.
- Layout follows `diagrams/fleet-floor-interface-layout_v1.excalidraw`.
- Grid: default 5 x 5, max 20 x 20, origin 0,0.
- Cell clicks depend on Edit Mode: edit toggles Open/Obstacle; non-edit places a robot.
- Move / Turn Left / Turn Right are only enabled when a robot is selected, and are also bound to arrow keys.
- Talk to the backend over HTTP only; no direct engine or DB access.

## Errors

- Errors show inline, in red text, below the grid and above the movement controls.
- Errors stack: each new error is added to the list. Each has an X button that dismisses only that error.
- The list has a max height of 50px (`max-h-[50px]`) and scrolls vertically (`overflow-y-auto`).
- With more than one error, a `Clear errors` button appears at the bottom right and removes every error.

## Testing

Error display tests go in `app.spec.ts` (App renders the error list between the grid and the controls):

- Error text is red and sits below the grid and above the movement controls.
- Two errors → both show.
- Clicking an error's X removes only that error.
- The list has the `max-h-[50px]` and `overflow-y-auto` classes.
- `Clear errors` is hidden with one error, shown with two, and clicking it empties the list.
