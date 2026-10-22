### Example 1 where I had to intervene with Claude
While reviewing the CLAUDE.md plan, Claude found a "Troubleshooting Flowchart" in the system overview diagram and suggested adding it to CLAUDE.md as a debugging ground rule. I decided to ignore the flowchart and had the suggestion removed from the plan. This was a hidden artifact from using excalidraw.com from a previous drawing. It should have been cleared when starting a new diagram but it persisted on multiple saves until I hard refreshed the site. There were no visual elements on the page but markup existed in the file upon inspection.

### Example 2 where I had to intervene with Claude
I used Claude to evaluate different testing frameworks with the intent to unify my backend and frontend testing under one framework. I used a 2 sub-agent pros / cons pattern to choose. This caused some problems down the road where it kept confirming that NestJS would install Jest by default, even though it installed Vitest in the end. Vitest is what I wanted. I gave it instructions to remove Jest if it got installed, which it then confused with the actual Vitest installation. So I had to proceed carefully to not remove the actual testing framework I wanted.

Asked Claude to update CLAUDE.md so a copy of every plan is also saved to the project-local `.claude/plans/` folder (plan mode's default location is left unchanged).

Executed the plan to scaffold the NestJS API at `apps/api` (plan copy in `.claude/plans/create-a-plan-to-parsed-shore.md`). Plan decisions: `apps/api` path, `better-sqlite3`, DB at `apps/api/data/fleet.sqlite`, root npm-workspaces `package.json`, env config in `.env` (PORT, DB_PATH, CORS_ORIGIN). The plan assumed `nest new` would set up Jest and ESLint, but Nest CLI 12 now scaffolds Vitest and oxlint. Decisions made during execution: replace oxlint with ESLint flat config + Prettier (matching CLAUDE.md); keep the generated e2e test, coverage and debug scripts. First tried Vitest with unplugin-swc as the plan specified, but SWC's native addon refused to load because this machine's `C:\` ACL grants BUILTIN\Users Full Control. Dropped SWC and went back to Nest 12's default Vite 8 transform; DI works without it (unit and e2e tests pass).

Created TypeORM entities (one file each). Decided FK owners: Cell→Floor, Robot→Cell, QueuedCommand→Robot; int Ids; snake_case columns.

Executed the plan to scaffold the Angular client at `apps/web` (plan copy in `.claude/plans/create-a-plan-to-sunny-crayon.md`). Plan decisions: Angular 22.2.3 with `ng new`, `apps/web` path (docs changed from `web/`), Vitest through Angular's unit-test builder (the v22 default, so no Jest), Tailwind, no router, no SSR, `ng add angular-eslint` + `eslint-config-prettier`, separate `dev:api` / `dev:web` scripts (no `concurrently`), direct HTTP to the API using the existing CORS setup, `apiUrl` in Angular environment files, `provideHttpClient(withFetch())`. Root `build`/`test`/`lint`/`format` now run across all workspaces. During execution, the environment files were written by hand instead of with `ng generate environments` because `npm install` was blocked in the session. Install, `ng add angular-eslint` and verification were left for the user to approve.

Follow-up: the user ran `npm install` and removed the nested `apps/web/.gitignore`. Then `ng add angular-eslint` (v22.6.0) ran. At the user's request, web ESLint matches the API: `eslint-config-prettier` + `eslint-plugin-prettier`, with `eslint-plugin-prettier/recommended` last. The user fixed the grid default in `frontend.md` (now 5 x 5). Verified: root build/test/lint pass for both apps, web `src` passes `prettier --check`, both dev servers serve, and the CORS header is returned for `http://localhost:4200`.

Filled README Setup, How to Run and Scenario Runner with install/usage steps (plan copy in `.claude/plans/review-the-current-project-compressed-babbage.md`). Decisions: Modules Chosen and What's Missing left empty; no minimum Node version stated (none pinned, tested on 24.21); migrations and scenario runner noted as not yet available.

Reviewed `.claude/plans/interface-scaffold-plan.md`. Claude flagged gaps and open questions: frontend models (API entities cannot be imported), Direction encoding for the robot arrow, grid origin/y-axis, default size (diagram 10x8 vs CLAUDE.md 5x5), responsive behaviour at 600px, what an action "hook" means in Angular, stub return data, and scope (log modal, arrow keys, cell clicks, tests). No decisions yet.

README: added macOS/Linux instructions. Env copy step now labelled by OS (cp for macOS/Linux, Copy-Item for Windows), plus a note that npm commands are the same on every platform.

Revised the interface scaffold plan with these decisions: default 5x5; origin bottom-left (y up); Direction 0-3 = N/E/S/W; web-side models where Robot x/y derive from its cell; queue drops below the grid at 600px (max 200px); generic button + empty API service; arrow keys trigger the controls; empty log modal with an X; Tailwind. Cell clicks, control disabling and state store are deferred. Button targets are TBD.

README: removed the note saying npm commands are the same on every platform, at the user's request.

Re-ran the README install/usage plan. The README already matched it, so nothing changed. Checked it against package.json scripts, .env.example, the web environment URLs and DB_PATH getOrThrow; prettier --check passes.

Reviewed api-scaffold-plan.md and wrote api-crud-scaffold-plan.md. Decisions: real TypeORM repos; entities stay in database/; flat CRUD routes; install class-validator/class-transformer + tsx; unit + e2e tests (in-memory SQLite); engine placeholders; Direction 0-3 = N/E/S/W; Command = MOVE|TURN_LEFT|TURN_RIGHT; FK ownership taken from the entities; db:* scripts; update CLAUDE.md and the database rules.

Executed api-crud-scaffold-plan.md: CRUD for 5 resources (TypeORM repos, DTO validation, global ValidationPipe), init migration, db:* scripts via tsx, unit + in-memory e2e tests, engine placeholders. User chose to widen tsconfig.build rootDir (entryFile src/main) so src can import database/. e2e sets DB_PATH=:memory: and loads migrations via import.meta.glob. Not committed.

A subagent code review found 2 issues; both fixed test-first. (1) Update DTOs: @IsOptional let null through (500, or a detached FK); replaced with @ValidateIf(v !== undefined), new e2e test checks null -> 400. (2) RobotService placeholders made async so they reject; user chose eslint-disable require-await around the block over Promise.reject. Not committed.

Executed interface-scaffold-plan.md: web models, generic button, grid (bottom-left origin, scales to fit), cell, robot (arrow rotated direction*90deg), queue panel, log modal, empty SimulationApiService, App layout (queue below grid under 768px, max 200px) with stub handlers and arrow keys. Rulings: robot ID shown as R<id>; onOpenLog toggles the modal locally; Direction docs already done. 25 web tests; build/lint/test/prettier pass. Not committed.

Code review (subagent) follow-up. User chose: arrow keys ignored while the log modal is open, with modifiers held, or in text fields (handled keys preventDefault); log modal is a native <dialog> via showModal (Escape closes); floor max 500x400px with square cells sized to fit; queue max 400px (matches floor), 200px narrow; cells box-border. jsdom lacks dialog/isContentEditable, so specs use a test-only stub. 40 web tests pass.

Executed floor-grid-rules.md: added .claude/rules/floor-grid.md (paths: grid component). Grid owns floor state; load or create a 5x5 floor; width/height sliders 1-20 save on change via PATCH; API grows/shrinks cells and moves displaced robots to the nearest free Open cell (Manhattan, ties lowest y then x, robots in Id order) or rejects; client reverts and shows a dismissible red error. Test list included. Rule only, no code. Not committed.

Added edit mode to floor-grid-rules.md plan and new .claude/rules/edit-mode.md (app, button, grid, cell). Edit toggles cells Open/Obstacle, persisted via PATCH /cells/:id. Obstacle = solid red; borders black off / orange on. Button "Edit: Off"/"Edit: On", inline SVG locked/unlocked icon in currentColor, orange border when on. Open: toggling a cell that holds a robot. Rule only, no code. Not committed.

Ruled on robot cells for edit mode: a cell with a robot cannot become an Obstacle. Client ignores the click (no PATCH); API rejects obstacle=true on a cell with a robot and changes nothing. Updated edit-mode.md (rule + tests) and the plan addendum. Rule only, no code. Not committed.

Executed robot-rules plan: added .claude/rules/robot-rules.md (identity R<id>, direction, placement checked by client and API, selection toggle, LEFT/RIGHT/MOVE commands, queue panel via GET /robots/:id/queued-commands, styles, test list). Moved error display rules into frontend.md: errors stack, max 50px with scroll, X per error, "Clear errors" button (user's label); tests in app.spec.ts. Rules only, no code. Not committed.

Planned floor-grid implementation (.claude/plans/floor-grid-implementation-plan.md). User chose: floor grid only (no edit mode); frontend.md stacked error list in App; POST /floors creates Open cells, Grid filters GET /cells; robot loading deferred. Defaults flagged for review: 409 on no room, floor delete removes cells, sliders above grid, e2e cells at 19,19, SQLite-backed service spec. No code yet.

Executed floor-grid plan inline (4 tasks, no commit). API: POST /floors creates Open cells; PATCH resizes in one transaction with planResize (Manhattan, y then x, Id order) or 409. SQLite-backed service spec, restart e2e. Web: service floor/cell calls; Grid loads/creates floor, sliders PATCH on change, reverts on error; App stacked error list. Ruling: revert tests render between input and change. Manual browser check not run.

Ran an Opus subagent code review of the floor-grid work, then fixed per user: planResize now uses newly created cells as targets (mixed resize bug); Grid uses one switchMap pipeline so size and cells show together and stale responses are dropped; load and non-409 failures show "Server can't be reached"; added tests incl. two releases and 1x1 Obstacle. Output renamed gridError. Updated floor-grid.md and plan. Explained duplicate DataSource warning. Not committed.

Executing robot-rules impl plan (.claude/plans/robot-rules-impl-plan.md) inline on branch robot-rules. Edit mode was missing; user chose to implement edit-mode.md in the same run and keep the Grid output name gridError. Added rule: failed POST /robots shows "Robot failed to place.". params nullable via migration; commands LEFT/RIGHT/MOVE. No commit.

Finished robot-rules + edit-mode run. API: placement 400s, cell obstacle guard (400), GET /robots/:id/queued-commands, nullable params migration. Web: robot styles/arrows/selection, edit toggle with lock icon, cell PATCH, placement, command queue, errors. Rulings: Grid reloads robots after resize; queue load failure shows server error; cells focusable for lint. Tests: API 92, e2e 11, web 120; lint/build OK. Manual check not run. Not committed.

User asked robots not to move on height change. API already keeps robots on surviving cells; asked user whether they meant coordinates or screen position. User: keep robot behavior, add row/column number labels from the origin so rows visibly add at the top. Updated floor-grid.md: Axis labels section (y left, x below, from 0), explicit "robots keep surviving cell" rule, plus client and API tests. Rules only, no code.

Implemented grid axis labels per floor-grid.md: rowLabels (height-1..0) left of the floor, columnLabels (0..width-1) below, sized to cellSize and driven by the saved floor so labels change with the cells. Added 2 grid.spec tests (label order, height increase adds labels at top) and the missing API test that robots on surviving cells keep their cell (grow and shrink). Web 122, API 94 pass; lint and Prettier OK. Not committed.

User asked for the inline error X to look more like a button, with a pointer cursor. Asked which style; user picked a small bordered box. Updated frontend.md Errors section: `rounded border border-red-600 px-1.5 leading-none hover:bg-red-100 cursor-pointer`. Rules only, no code.

Applied the error X button style from frontend.md to app.html (bordered red box, hover:bg-red-100, cursor-pointer). Prettier OK; web tests 122 pass. Not committed.

User asked for the error X to match the other buttons, centered. Asked size (app-button is ~40px, list is 50px); user picked compact. X now uses app-button colors/border/hover in an h-6 w-6 flex square, centered both ways. Updated frontend.md + app.html. Web tests 122 pass. Not committed.

User asked to move all current changes from robot-rules to main and not make new branches again. Both branches were at the same commit, so git switch main carried all 48 uncommitted changes over. robot-rules branch left in place (not deleted). Not committed.

User asked to add the rules file from engine-plan.md. Created .claude/rules/engine.md scoped to apps/engine/**: currentTick (0, +1), tickRate (1000ms), running, step() calls doNext() from apps/queue and awaits it, errors shown under the grid, auto-step while running, step + toggle endpoints. camelCase picked to match existing methods. Not committed.

User confirmed the engine lives in apps/engine. Updated CLAUDE.md: folder structure now lists apps/engine/ (Engine) and drops Engine from the apps/api line; added engine.md to the Rules files list. Not committed.

User asked to add the rules file from command-plan.md. Created .claude/rules/commands.md (apps/api, apps/engine, apps/queue): POST /commands/<name> per command, RId -> displayId, LEFT/RIGHT/MOVE enqueue and run per tick via step()/doNext(), MOVE resolution + block reasons in tick response, ignored requests -> descriptive 400, PLACE uses NORTH/EAST/..., REPORT to stdout. Updated robot-rules Identity and CLAUDE.md list. Not committed.

User asked to add the rules file from queue-plan.md (the plan's cut-off line was fixed by the user). Created .claude/rules/queue.md (apps/queue/**): doNext() returns a promise, orders robots by displayId (user choice), returns each robot's next parsed command for the Engine to execute, and deletes it whether it succeeds or fails. Aligned commands.md/engine.md; added apps/queue + queue.md to CLAUDE.md. Not committed.

User decided doNext() leaves commands that fail to parse out of its result (they are still deleted). Added the rule and a test line to queue.md. Not committed.

Implemented engine.md. User chose: stub apps/queue doNext (remove when queue lands), plain TS engine, poll GET /engine, wire Step/Play. Approved config: root "type":"module", API rootDir "..", build to dist/api/src, lint/vitest/prettier cover engine+queue. API: GET /engine, POST /engine/step, /engine/toggle. Errors shown under grid. Tests: API 112, e2e 14, web 133. Not committed.

User asked for a subagent code review of the engine implementation. Dispatched a read-only general-purpose reviewer against uncommitted changes vs HEAD 9eedd4f, checking engine/queue/command code against engine-plan, engine-impl-plan, queue-plan, command-plan and the rules files. It may run test/lint/build. Not committed.

Engine review result: with fixes. Critical: stray tsc output (.js/.d.ts/.map) in apps/engine and apps/queue shadow .ts in tests and break lint. Important: pause/resume during a step can create a 2nd timer chain; manual Step can overlap an auto step; queue/commands still stubbed. Plan issue: displayId not in diagram. No fixes applied yet.

Applied review fixes. User chose: delete stray build files, gitignore them, fix pause/resume timer (run counter + test), and Step while running -> API 400 + Step disabled in UI. Updated engine.md. Deleting the files was blocked by permissions; user to delete. Tests API 114 / web 134 pass; lint fails only on the stray .d.ts. Not committed.

User deleted the stray build files. Reran: tests API 114 / web 134 pass against the .ts sources; lint passes for API and web. Not committed.

User updated queue.md doNext rule (returns the found commands). Updated its Testing list to match. Planned doNext impl: user chose Robot displayId column (unique, auto = id), queue moved into Nest at apps/api/src/queue, doNext(): Promise<Promise<{robot, command} | null>[]> (one promise per robot, null for empty/unparseable), Engine gets doNext injected. Executing commands out of scope. Plan: .claude/plans/queue-do-next-impl-plan.md. Not committed.

Executed queue plan natively (user chose to continue over a parallel session's engine-execution-plan). Kept -1 placeholder for displayId = id. Added displayId + backfill migration, 409 on duplicate; QueueModule/QueueService.doNext (one promise per robot, null for empty/unparseable); Engine merged into EngineService (awaits all promises). Updated rules/CLAUDE.md. Duplicate migration + apps/engine, apps/queue deletion blocked; user to delete. API 121 / web 134 / e2e 16 pass; build ok. Not committed.

Play/Pause now reads Play/Pause by state; grid reloads robots and queue panel reloads on each tick. Pending work: user chose engine in Nest calling its own LEFT/RIGHT/MOVE functions in-process, one batched moveAll per tick; block reasons returned only (user adds reporting later). Waited for a parallel session (queue/displayId); restored its lost displayId migration; removed duplicate placeholders. Config reverted. API 140/e2e 16/web 143 pass. Not committed.

User asked to run the migration without committing. Ran npm run db:migrate: RobotDisplayId1792699307727 applied to the dev DB; robot.display_id backfilled from id. Not committed.

User asked for a plan: Delete button beside the movement controls, enabled only with a robot selected, sends DELETE /robots/:id. User chose: service deletes queued commands with the robot in one transaction (no migration), no keyboard shortcut, no confirm, allowed while playing. Plan saved to .claude/plans/delete-robot-button-plan.md. Not implemented.

Implemented the Delete button plan. RobotService.remove deletes queued commands + robot in one transaction. Web: deleteRobot(), Grid.removeRobot(), App onDelete (clears selection/queue if still selected; Robot failed to delete. on error). Delete button after Move, disabled with no selection. Updated robot-rules.md, CLAUDE.md. Lint ok; API 141 / e2e 17 / web 148 pass; build ok. Not committed.

User asked for a plan: Reset All button after Log; confirm "Reset the entire floor?"; Yes resets floor. User chose: new POST /floors/:id/reset (in place, same id), clear all LogEntry rows, pause engine + tick 0, browser confirm(). Floor → 5x5 all Open; robots/queued commands/cells deleted. Plan saved to .claude/plans/reset-all-button-plan.md. Not implemented.

User clarified: Reset All must stop Play and the button must revert to Play. User chose: stop only after Yes (No leaves it playing). Plan updated: client re-reads engine state after reset success or failure so the label always matches the server; added tests for No-while-running and failed reset.

User asked to center the robot movement controls at the bottom. User chose: centered in the layout's last row (not fixed to viewport). Wide layout: controls area now spans both columns (`controls controls`); buttons centered with justify-center. Narrow layout unchanged apart from centering. Not committed.

Implemented Reset All (native). API: EngineService.reset() (async, waits for an in-flight tick), FloorService.reset + POST /floors/:id/reset. Web: resetFloor(), Grid.resetFloor() (drops in-flight resize), App onResetAll with confirm, re-reads engine on success/failure. Review fixed 2 races. Updated frontend.md. Lint ok; API 150 / e2e 18 / web 160 pass; build ok. Not committed.
