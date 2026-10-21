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
