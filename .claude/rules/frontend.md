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

## Engine controls

- The Play / Pause button reads `Pause` while the engine is running and `Play` while it is paused.
- After every tick (a Step, or a new `currentTick` while polling), the grid reloads its robots and the queue panel reloads the selected robot's queue.

## Reset All

- A `Reset All` button sits right after `Log`. Click → `window.confirm('Reset the entire floor?')`.
- No → nothing is sent; a running engine keeps running (`Pause`).
- Yes → `POST /floors/:id/reset`. The API pauses the engine and sets that floor's tick to 0, deletes the floor's queued commands, robots, cells, log entries and snapshots (other floors untouched), and rebuilds the floor as 5 x 5 all Open (same floor id).
- Then the grid shows the new floor, the selection and queue panel clear, and the client re-reads `GET /engine`, so the button reads `Play`.
- Failure → `Floor failed to reset.` shows, and `GET /engine` is still re-read so Play / Pause matches the server.

## Delete Floor

- A `Delete Floor` button sits right after `Reset All`. See `timeline.md`.

## Errors

- Errors show inline, in red text, below the grid and above the movement controls.
- Errors stack: each new error is added to the list. Each has an X button that dismisses only that error.
- The X button matches the app-button colors, border, and hover, as a compact square with the X centered both ways and a pointer cursor on mouseover: `flex h-6 w-6 cursor-pointer items-center justify-center rounded border-2 bg-[#a5d8ff] leading-none text-[#1971c2] hover:brightness-95`.
- The list has a max height of 50px (`max-h-[50px]`) and scrolls vertically (`overflow-y-auto`).
- With more than one error, a `Clear errors` button appears at the bottom right and removes every error.

## Testing

Engine control tests go in `app.spec.ts` (label, queue reload) and `grid.spec.ts` (robot reload on a `tick` change).

Reset All tests go in `app.spec.ts` (placement, confirm text, No / Yes, running → `Play`, failure), `grid.spec.ts` (`resetFloor()` shows a 5 x 5 Open floor with no robots), and `apps/api/src/floor/floor.service.spec.ts` (cells, robots, queued commands, log, engine, same id, 404).

Error display tests go in `app.spec.ts` (App renders the error list between the grid and the controls):

- Error text is red and sits below the grid and above the movement controls.
- Two errors → both show.
- Clicking an error's X removes only that error.
- The list has the `max-h-[50px]` and `overflow-y-auto` classes.
- `Clear errors` is hidden with one error, shown with two, and clicking it empties the list.
