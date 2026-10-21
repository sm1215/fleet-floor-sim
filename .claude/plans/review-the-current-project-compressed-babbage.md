# Populate README with installation and usage

## Context
`README.md` is an empty skeleton (Setup, How to Run, Scenario Runner, Modules Chosen, What's Missing). User wants install/usage instructions. Scope chosen: fill **Setup**, **How to Run**, **Scenario Runner**; leave **Modules Chosen** and **What's Missing** headings empty.

## Facts found in the repo
- npm workspaces (`apps/*`): `apps/api` (NestJS 12, TypeORM + better-sqlite3), `apps/web` (Angular 22, Tailwind).
- Root scripts: `dev:api`, `dev:web`, `build`, `test`, `lint`, `format`. API-only: `npm run test:e2e -w apps/api`.
- API reads `apps/api/.env` (`PORT=3000`, `DB_PATH=./data/fleet.sqlite`, `CORS_ORIGIN=http://localhost:4200`); `DB_PATH` is required (`getOrThrow` in `apps/api/src/app.module.ts`). Template: `apps/api/.env.example`.
- Web calls API at `http://localhost:3000` (`apps/web/src/environments/*.ts`); `ng serve` on `http://localhost:4200`.
- Verified locally on Node v24.21.0. No `engines` field in root package.json.
- No migrations yet (`apps/api/database/migrations/` empty); `db:migrate*` and `scenario` scripts don't exist.

## README content (edit `README.md` only)
1. Short intro line (robot fleet floor simulator; Angular client + NestJS API + SQLite) and pointer to `diagrams/`.
2. **Setup**
   - Prereqs: Node.js + npm (note "tested with Node 24.21"; no exact minimum stated since none is pinned).
   - `npm install` from repo root (installs both workspaces).
   - Copy env: `cp apps/api/.env.example apps/api/.env` (+ PowerShell `Copy-Item` equivalent); table of the 3 vars.
   - Note: migrations not available yet (`db:migrate` to be added).
3. **How to Run**
   - Two terminals: `npm run dev:api` → http://localhost:3000, `npm run dev:web` → http://localhost:4200.
   - Commands table: build, test, test:e2e, lint, format.
4. **Scenario Runner**
   - Not implemented yet. Planned: `npm run scenario -- path/to/scenario.txt`, plain-text file, runs against the Engine directly (not over HTTP); file format TBD.

## Also (per CLAUDE.md)
- Copy this plan to `.claude/plans/review-the-current-project-compressed-babbage.md`.
- Append an AI_USAGE.md entry (≤500 chars).
- No commit unless asked.

## Verification
- Read the rendered README; confirm every command matches `package.json` scripts and env values match `.env.example`.
- `npx prettier --check README.md` (read-only check).
