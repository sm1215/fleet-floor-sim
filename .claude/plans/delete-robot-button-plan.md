# Plan: Delete robot button

## Goal
Add a **Delete** button next to Turn Left / Turn Right / Move. Same rules as those buttons: it's only enabled while a robot is selected. Clicking it sends `DELETE /robots/:id`, which removes the robot from the database.

## Decisions (user)
- Queued commands: `RobotService.remove` deletes the robot's queued commands, then the robot, in one transaction. No migration and no cascade.
- No keyboard shortcut. Button only.
- No confirmation. A click deletes right away.
- Allowed while the engine is playing, like the movement buttons.

## Calls made by Claude (check these)
- Failure message: `Robot failed to delete.` (mirrors `Robot failed to place.`). It goes in the existing error list.
- The grid removes the robot locally on success through a public `Grid.removeRobot(id)`, called from App via `viewChild(Grid)`. No full robot reload.
- On success, App clears the selection (`selectedRobotId = null`) and the queue panel (`queue = []`).
- No LogEntry is written. The robot endpoints don't log today.
- Button order: Turn Left, Turn Right, Move, Delete. Same `app-button` styling.

## Current state
- `DELETE /robots/:id` already exists (`robot.controller.ts`). `RobotService.remove` returns 404 for an unknown id.
- `QueuedCommand.robot` has no `onDelete`. Deleting a robot that has queued commands would violate the FK.

## Steps

### API
1. `apps/api/src/robot/robot.service.ts` `remove(id)`: inside `this.repo.manager.transaction`, look up the robot (404 if it's missing), delete the `QueuedCommand` rows where `robot.id = id`, then remove the robot.
2. `robot.service.spec.ts`: removing a robot also deletes its queued commands (inside the transaction). The existing 404 test still passes.
3. `apps/api/test/robot.e2e-spec.ts`: create a robot, queue a command, `DELETE /robots/:id` → 200. `GET /robots` no longer includes it and `GET /robots/:id/queued-commands` is empty.

### Web
4. `services/simulation-api.service.ts`: `deleteRobot(id): Observable<void>` → `DELETE ${api}/robots/${id}`. Add a spec test for the URL and method.
5. `components/grid/grid.ts`: public `removeRobot(id)` filters `robots`. Add a `grid.spec.ts` test that the robot is no longer rendered.
6. `app.ts`: `onDelete()`. With no selection it does nothing. Otherwise it calls `api.deleteRobot(id)`. On success: `grid.removeRobot(id)`, clear the selection and queue. On error: `addError(DELETE_ERROR)` and change nothing else. Export `DELETE_ERROR = 'Robot failed to delete.'`.
7. `app.html`: `<app-button label="Delete" [disabled]="selectedRobotId() === null" (pressed)="onDelete()" />` after Move.
8. `app.spec.ts`:
   - No selection → Delete disabled.
   - Selected → click sends DELETE with the robot's id, the robot is gone from the grid, the selection and queue are cleared, and the controls are disabled again.
   - Failure → robot still shown, still selected, and `Robot failed to delete.` shown.

### Rules/docs
9. `.claude/rules/robot-rules.md`: add a "Delete" section with the rules above and the matching Testing entries (client + API).
10. `CLAUDE.md` Interface: add Delete to the Controls line.
11. `AI_USAGE.md` entry.

## Verify
`npm run lint`, `npm run test`, `npm run test:e2e -w apps/api`, `npm run build`. Then a manual check: select a robot with queued commands, press Delete, and the robot is gone, including after a reload.
