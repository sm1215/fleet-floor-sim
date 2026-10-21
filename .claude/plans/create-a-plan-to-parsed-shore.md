# Plan: Scaffold NestJS API at `apps/api` (TypeORM + SQLite, Vitest)

## Context
The repo has only docs and diagrams so far: no `package.json` and no code. This step sets up the backend:
- a NestJS app at `apps/api`
- TypeORM on SQLite (`better-sqlite3`)
- env config in `.env` (PORT, DB_PATH, CORS_ORIGIN)
- Vitest instead of Nest's default Jest

At the end, the server starts, connects to SQLite, and the test suite passes.

Decisions (confirmed with user):
- Path is `apps/api`. Update CLAUDE.md and the `.claude/rules` globs to match.
- Run `nest new`, then remove all Jest pieces before the first install.
- Driver: `better-sqlite3`.
- DB file: `apps/api/data/fleet.sqlite`.
- Create the root npm-workspaces `package.json` now.

## Steps

### 1. Root workspace
Create `package.json` at the repo root:
- `"private": true`
- `"workspaces": ["apps/*"]`
- Scripts that forward to the api workspace, only for things that exist after this step:
  - `dev` → `npm run start:dev -w apps/api`
  - `build`, `test`, `lint` and `format` → `npm run <x> -w apps/api`

### 2. Scaffold
```
npx @nestjs/cli@latest new api --directory apps/api --skip-install --skip-git --package-manager npm --strict
```
- Keep the generated ESLint flat config (`eslint.config.mjs`) and `.prettierrc`. They meet the lint/format standard. Moving them to the repo root can wait until `web/` exists.
- Delete the nested `apps/api/.gitignore`. The root `.gitignore` already covers everything.

### 3. Remove Jest (before installing)
In `apps/api/package.json`:
- Delete the `"jest"` config block.
- Delete the dev deps `jest`, `ts-jest`, `@types/jest`, `supertest` and `@types/supertest`. Keep `@nestjs/testing`, which is runner-agnostic.
- Delete the `test:watch`, `test:cov`, `test:debug` and `test:e2e` scripts.

Delete the `apps/api/test/` folder (`jest-e2e.json` and `app.e2e-spec.ts`).

### 4. Add Vitest
Dev deps: `vitest`, `unplugin-swc` and `@swc/core`. This is Nest's documented Vitest setup; SWC keeps the decorator metadata that DI needs.

Add `apps/api/vitest.config.ts`:
```ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { root: './', include: ['src/**/*.spec.ts'] },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
```

Scripts:
- `"test": "vitest run"`
- `"test:watch": "vitest"`

Update `src/app.controller.spec.ts` so it imports `describe/it/expect/beforeEach` from `vitest`. Leave the test logic as it is.

### 5. Config and env
- Add dep `@nestjs/config`.
- In `AppModule`: `ConfigModule.forRoot({ isGlobal: true })`. It reads `apps/api/.env`, since npm workspace scripts run with the workspace as the cwd.
- Create `apps/api/.env` (gitignored):
  ```
  PORT=3000
  DB_PATH=./data/fleet.sqlite
  CORS_ORIGIN=http://localhost:4200
  ```
- Create `apps/api/.env.example` with the same keys. `.gitignore` already allows `!.env.example`.
- In `main.ts`:
  - `app.enableCors({ origin: config.get('CORS_ORIGIN') })`
  - `app.listen(config.get('PORT') ?? 3000)`

### 6. TypeORM + SQLite
- Add deps `@nestjs/typeorm`, `typeorm` and `better-sqlite3`, plus dev dep `@types/better-sqlite3`.
- In `AppModule`, use `TypeOrmModule.forRootAsync` with `ConfigService`:
  - `type: 'better-sqlite3'`
  - `database: config.get('DB_PATH')`
  - `entities: []` (no entities yet; that is a later step, gated on the FK-ownership decision)
  - `synchronize: false`
- Create `apps/api/data/.gitkeep`. better-sqlite3 does not create missing directories. `*.sqlite` is already gitignored.
- Create `apps/api/database/migrations/.gitkeep`.
- Leave the migration CLI scripts and the DataSource file for later. They aren't needed until entities exist.

### 7. Install
Run `npm install` from the repo root. This creates the root `package-lock.json` and hoists `node_modules`.

### 8. Docs and housekeeping
- **CLAUDE.md:**
  - Folder structure: `api/` → `apps/api/` and `api/database/migrations/` → `apps/api/database/migrations/`.
  - SQLite location: `apps/api/data/fleet.sqlite`, set via `DB_PATH`.
  - Mark the commands that now exist.
- **`.claude/rules/backend.md` and `database.md`:** change the path globs from `api/**` to `apps/api/**`, and the migrations path to match.
- **`.claude/plans/`:** save a copy of this plan.
- **`AI_USAGE.md`:** add a short summary of the prompt and the decisions above.
- No commit unless asked.

## Verification
1. `npm run build`: compiles under strict TS.
2. `npm run dev`:
   - The log shows `Nest application successfully started` and that the TypeORM module initialized.
   - `curl http://localhost:3000` returns `Hello World!`.
   - `curl -i -H "Origin: http://localhost:4200" http://localhost:3000` shows `Access-Control-Allow-Origin: http://localhost:4200`.
   - `apps/api/data/fleet.sqlite` now exists.
   - Then stop the server.
3. `npm run test`: Vitest runs `app.controller.spec.ts` and it passes.
4. `npm run lint`: clean.
5. Check that `jest` and `ts-jest` are absent: `npm ls jest ts-jest` reports empty.
