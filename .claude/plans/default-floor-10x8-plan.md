# Default floor 10 x 8 (interface), scenario runner stays 5 x 5

**Goal:** Every floor the interface/API creates by default is 10 wide x 8 high. The scenario runner keeps starting on 5 x 5, and a bare `FLOOR` scenario line still means 5 x 5.

**Decisions (user):**
- 10 x 8 applies to: the grid's first floor on load, Reset All (`POST /floors/:id/reset`), deleting the last floor, and the `POST /commands/floor` default when width/height are left out.
- Scenario runner: start floor and bare `FLOOR` stay 5 x 5, through its own constant.
- Update CLAUDE.md, the `.claude/rules` files and the interface diagram text. `DECISIONS.md` is ignored.

## Task 1: API constants

- `apps/api/src/floor/floor.model.ts`: replace `DEFAULT_FLOOR_SIZE = 5` with
  `DEFAULT_FLOOR_WIDTH = 10` and `DEFAULT_FLOOR_HEIGHT = 8` (doc: new, reset or recreated floor).
- `apps/api/src/scenario/parse-line.ts`: add `export const SCENARIO_FLOOR_SIZE = 5;` (start floor and bare `FLOOR`). Use it for the `FLOOR` defaults.
- `apps/api/src/scenario/run-scenario.ts`: start command uses `SCENARIO_FLOOR_SIZE`.
- `apps/api/src/engine/commands.controller.ts`: defaults → `DEFAULT_FLOOR_WIDTH` / `DEFAULT_FLOOR_HEIGHT`.
- `apps/api/src/floor/floor.service.ts` `reset()`: save width/height from the new constants; update the doc comment ("all-Open 10 x 8").
- `apps/api/src/engine/engine.service.ts:208` (delete last floor): `this.floor(DEFAULT_FLOOR_WIDTH, DEFAULT_FLOOR_HEIGHT)`. Log line becomes `FLOOR 10, 8, CREATED`.

## Task 2: API tests (update first, watch them fail, then Task 1)

- `commands.controller.spec.ts`: "floor defaults to 10x8" → `engine.floor` called with `(10, 8)`.
- `floor.service.spec.ts`: reset tests expect `{ width: 10, height: 8 }`, 80 Open cells, coordinates x 0..9 × y 0..7 (the 8 x 6 start floor now grows on reset; the lock test's 48 → 80). Delete-last test expects 10 x 8.
- `test/floor.e2e-spec.ts`: reset → `{ id, width: 10, height: 8 }`.
- `test/history.e2e-spec.ts`: posts `{}`, so expect `{ width: 10, height: 8 }`.
- Scenario guard (`test/scenario.e2e-spec.ts`, "starts on a fresh 5x5 floor"): add `PLACE R1 5,0,NORTH\nREPORT` → `EMPTY\n` (out of bounds only on 5 x 5). `run-scenario.spec.ts` (start floor `(5,5)`) and `parse-line.spec.ts` (bare `FLOOR` → 5, 5) stay as they are and must still pass.
- Other e2e files posting `{}` (`commands`, `engine`, `floor:93`): run them; if any rely on a 5 x 5 edge, send `{ width: 5, height: 5 }` explicitly instead of changing what they test.

## Task 3: Web

- `apps/web/src/app/components/grid/grid.ts`: `DEFAULT_SIZE = 5` → `DEFAULT_WIDTH = 10`, `DEFAULT_HEIGHT = 8`; use them for the initial `width`/`height` signals and the `floorCommand` on an empty `GET /floors`.
- `grid.spec.ts:220`: expect `floorCommand({ width: 10, height: 8 })`, 80 cells, sliders 10 / 8. (Write first, watch it fail.)
- `grid.spec.ts` resetFloor test and its stub (`resetFloor` returns `{ width: 5, height: 5 }`): change the stub to 10 x 8 and expect 80 cells, sliders 10 / 8, so it matches the API.
- `services/simulation-api.service.ts:116` doc comment: "rebuilds it 10 x 8 all Open".
- `app.spec.ts` "renders the default 5 x 5 floor" uses a mocked `getFloors` returning 5 x 5; it does not test the default. Leave it.

## Task 4: Docs, rules, diagram

- `CLAUDE.md`: Interface → "Grid: default 10 x 8 (width x height), max width 20, max height 20"; Scenario runner → note it starts on 5 x 5.
- `.claude/rules/frontend.md`: grid default 10 x 8; Reset All rebuilds 10 x 8; reset test note.
- `.claude/rules/floor-grid.md`: init `POST /commands/floor { width: 10, height: 8 }`; test line "UI shows 10x8".
- `.claude/rules/commands.md`: FLOOR defaults `width` 10, `height` 8; line 143 "defaults to 10×8". Note that scenario `FLOOR` defaults to 5×5.
- `.claude/rules/timeline.md`: deleting the last floor creates 10 x 8 (logged `FLOOR 10, 8, CREATED`).
- `.claude/rules/scenario-runner.md`: unchanged (5x5), add "its own 5 x 5 default, not the interface's 10 x 8".
- `diagrams/fleet-floor-interface-layout_v1.excalidraw`: `text` and `originalText` → `"Default: 10 x 8\n..."`.
- `AI_USAGE.md` entry for the implementation.

## Verification

`npm run test`, `npm run test:e2e -w apps/api`, `npm run lint`, `npm run build`, and every file in `scenarios/` vs `scenarios/expected/` (covered by the scenario e2e). Manual: fresh DB → `npm run dev:api` + `npm run dev:web` → 10 x 8 grid; Reset All → 10 x 8; delete the only floor → 10 x 8. `npm run -s scenario -- <file>` with `PLACE R1 4,4,NORTH` + `REPORT` still works and `5,0` is ignored.

Existing DBs keep their current floor size; only new/reset/recreated floors are 10 x 8. No migration needed.
