# Engine implementation plan

Implements `.claude/rules/engine.md`.

## User rulings
- `apps/queue/do-next.ts`: stub `doNext(): Promise<void>` (no-op). Remove the stub when the queue is implemented (next task).
- Engine is plain TS source (no package.json); the API imports it by relative path.
- Config (approved): root package.json `"type": "module"`; API tsconfig + tsconfig.build `rootDir: ".."` (build output moves to `dist/api/src`, nest-cli `entryFile` and `start:prod` updated); API vitest and lint cover `../engine` and `../queue`; `apps/engine` and `apps/queue` get a tsconfig.json extending the API's.
- While running, the client polls `GET /engine` every `tickRate` ms; errors show under the grid.
- Wire the Step and Play / Pause buttons.

## Engine (`apps/engine/engine.ts`)
- `currentTick = 0`, `tickRate = 1000`, `running = false`.
- `step()`: `currentTick += 1`, `await doNext()`; errors propagate to the caller.
- `toggle()`: flips `running`. Running schedules `step()` with `setTimeout(tickRate)`; the next tick is scheduled after the step settles, so steps never overlap. Errors from auto steps go to an `onError` callback passed to the constructor; running continues.
- `stop()` clears the timer (used on API shutdown).

## API (`apps/api/src/engine/`)
- `EngineService` owns one `Engine`, collects auto-step errors, stops on module destroy.
- `GET /engine` → `{ currentTick, tickRate, running, errors }`; returned errors are cleared.
- `POST /engine/step` → state, or 500 with the error message.
- `POST /engine/toggle` → state.
- No request bodies, so no DTOs.

## Web
- Service: `getEngine`, `stepEngine`, `toggleEngine`.
- App: GET /engine on load; Step → POST step; Play / Pause → POST toggle; poll while running; errors (server message, else "Server can't be reached") added to the error list.

## Tests
- Engine unit (mocked doNext, fake timers), EngineService/controller unit, engine e2e, web service + App specs.

## Addendum (during execution)
- ESLint ignores files outside its config's folder, so `apps/api` `lint` runs a second pass from `apps/`: `eslint -c api/eslint.config.mjs "{engine,queue}/**/*.ts"`.
- `apps/engine/.prettierrc` and `apps/queue/.prettierrc` copy the API's (user approved).
- `tsconfig.build.json` also excludes `../engine/**/*spec.ts` and `../queue/**/*spec.ts`.
- Web tests fake only `setInterval` so `fixture.whenStable()` still works.
