# Plan: Scaffold Angular 22 client at `apps/web` (Tailwind, Vitest, angular-eslint)

## Context
The repo has a working NestJS API at `apps/api` (Vitest, ESLint flat + Prettier, CORS for `http://localhost:4200` via `CORS_ORIGIN`). There's no client yet. This step scaffolds the Angular client so it can talk to the API over HTTP. Feature UI (grid, controls, queue, log) is out of scope.

Checked before planning:
- `@angular/cli` latest = **22.2.3**. Its engines need Node `^24.15.0`, and the machine has Node 24.21 / npm 11.19, so that's OK.
- The `ng new` schematic in v22 has `testRunner` enum `vitest | karma`, default **`vitest`**. No Jest gets installed. `ng new` doesn't set up ESLint.

Decisions (confirmed with user):
- Location is `apps/web`, matching the root `apps/*` workspaces glob. Update the docs that still say `web/`.
- Test runner: the Vitest default, through Angular's unit-test builder.
- Linting: `ng add angular-eslint` plus `eslint-config-prettier`, the same pattern as the API.
- Styles: Tailwind (`--style=tailwind`).
- Dev: separate `dev:api` / `dev:web` scripts run in two terminals. No `concurrently`.
- API access: direct HTTP plus the existing CORS setup. The base URL goes in an Angular environment file.
- No router.

## Steps

### 1. Scaffold (no install yet)
From the repo root:
```
npx @angular/cli@22.2.3 new web --directory apps/web --skip-install --skip-git --package-manager npm --style tailwind --routing=false --ssr=false --test-runner vitest --ai-config none
```
- Standalone, strict and zoneless are the v22 defaults. Accept them.
- Delete the nested `apps/web/.gitignore`. The root one already covers `.angular/`, `dist/` and `node_modules/`. This matches what was done for the API.
- Check `apps/web/package.json`: there should be no Jest or Karma packages. If any appear, stop and ask.

### 2. Install
From the root: `npm install`. The workspace picks up `apps/web` through `apps/*`.

### 3. ESLint + Prettier
- `npx ng add angular-eslint` (run in `apps/web`). This installs `angular-eslint`, `eslint` and `typescript-eslint`, writes `eslint.config.js`, and adds the `lint` target and script.
- Add the dev dep `eslint-config-prettier` and put it last in the config, mirroring `apps/api/eslint.config.mjs`.
- Prettier: if `ng new` didn't create a `.prettierrc` / `prettier` devDep, copy the API's `.prettierrc` and add `prettier`. Keep the Angular HTML parser override for `*.html`.
- Add the script `"format": "prettier --write \"src/**/*.{ts,html,css}\""`.
- Make the web `test` script `ng test --watch=false`, so the root `npm run test` runs once and exits, like the API's `vitest run`.

### 4. HTTP wiring
- `npx ng generate environments`. Set `apiUrl: 'http://localhost:3000'` in `environment.ts` and in `environment.development.ts`.
- Add `provideHttpClient(withFetch())` in `apps/web/src/app/app.config.ts`.
- No services or API calls yet. Those come with the features.

### 5. Root scripts (`package.json`)
- `dev` → split into `dev:api` (`npm run start:dev -w apps/api`) and `dev:web` (`npm start -w apps/web`). Remove `dev`.
- `build`, `test`, `lint` and `format` → `npm run <x> --workspaces`, so they run for both apps.

### 6. Docs
- `CLAUDE.md`:
  - folder structure: `web/` → `apps/web/`
  - commands table: `dev:api` / `dev:web` replace `dev`, and set the status of build/test/lint/format to "Exists"
  - Tests bullet: replace "Before installing Angular…" with the actual setup (Angular 22 unit-test builder, Vitest)
- `.claude/rules/frontend.md`: change the glob `web/**` → `apps/web/**`.
- Flag for the user, not changed here: `frontend.md` says the grid default is 10 x 8, and CLAUDE.md says 5 x 5.
- `AI_USAGE.md`: add a short entry for this prompt and its decisions.
- Copy this plan to `.claude/plans/create-a-plan-to-sunny-crayon.md`.

Each package install and config change above was approved through this plan. Ask before committing.

## Critical files
- New: `apps/web/**` (`package.json`, `angular.json`, `eslint.config.js`, `src/app/app.config.ts`, `src/environments/*`, `.postcssrc.json`, `src/styles.css`)
- Modified: `package.json` (root), `CLAUDE.md`, `.claude/rules/frontend.md`, `AI_USAGE.md`
- Reference: `apps/api/eslint.config.mjs`, `apps/api/.prettierrc`, `apps/api/.env.example` (`CORS_ORIGIN`)

## Verification
1. `npm run build` builds both apps.
2. `npm run test`: API tests and the generated `app.spec.ts` (Vitest) pass and exit.
3. `npm run lint` passes for both apps. Running `npx prettier --check` in `apps/web` comes back clean.
4. In two terminals, run `npm run dev:api` and `npm run dev:web`. Opening http://localhost:4200 renders the app, and Tailwind classes apply (check with a utility class on the default template).
5. CORS check: `curl -i -H "Origin: http://localhost:4200" http://localhost:3000/` returns `Access-Control-Allow-Origin: http://localhost:4200`.
