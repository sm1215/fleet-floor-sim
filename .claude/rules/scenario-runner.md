---
paths:
  - "apps/api/src/scenario/**"
  - "scenarios/**"
---

# Scenario runner rules

## Location

- A standalone CLI in `apps/api/src/scenario/`, outside the NestJS HTTP app. It never starts the HTTP server or uses controllers.
- Invoked with `npm run scenario -- path/to/scenario.txt`.
- It gets the Engine via `NestFactory.createApplicationContext(...)` (DI only, no HTTP), and calls `EngineService` only. No other service, repository, or route.

## Isolation

- Each run uses an in-memory SQLite DB (`:memory:`) with migrations run on startup. The real DB (`DB_PATH`) is never touched.
- Each run starts with a new, default 5x5 floor with every cell Open. A `FLOOR` line resizes it.
- The Engine's `scenarioMode` is set to `true` (no `TICK` log entries, see `log-entry.md`). The Engine never auto-runs.
- When the run ends, the floor and everything on it are removed, and the app context is closed.

## Finding the file

- Absolute paths, and relative paths that exist, are used as given.
- Otherwise the path is resolved against `scenarios/` at the repo root, so `npm run scenario -- scenario-1.txt` loads `scenarios/scenario-1.txt`.
- No file found → print an error to stderr and exit with a non-zero code. This is the only fatal error.

## File format

Plain text, one command per line. Lines are split on `\r?\n`, so CRLF and LF both work.

- Leading and trailing whitespace is trimmed.
- Blank lines are ignored.
- Lines starting with `#` are ignored.
- Everything is case-insensitive: keywords and params. The line is uppercased before parsing (`place r1 0,0,east` = `PLACE R1 0,0,EAST`).
- Keywords, params, and their meanings match `commands.md`. Syntax: the keyword, then a space, then `RId` (if any), then a space, then the remaining params comma-separated. Whitespace around commas is allowed.

| Line                         | Example                    |
| ---------------------------- | -------------------------- |
| `FLOOR width,height`         | `FLOOR 4,3`                |
| `OBSTACLE x,y`               | `OBSTACLE 2,3`             |
| `PLACE RId x,y,DIRECTION`    | `PLACE R1 0,0,EAST`        |
| `QUEUE RId CMD [CMD ...]`    | `QUEUE R2 MOVE RIGHT MOVE` |
| `LEFT RId` / `RIGHT RId` / `MOVE RId` | `MOVE R1`         |
| `TICK [amount]`              | `TICK 3`                   |
| `REPORT`                     | `REPORT`                   |

- Missing optional params use the `commands.md` defaults (`FLOOR` 5,5, `TICK` 1).
- `QUEUE` takes one or more space-separated commands, enqueued in order.

## Invalid lines

- An unknown keyword, an invalid or missing param, or extra tokens → the line is ignored silently, and the runner continues with the next line.
- Anything the Engine ignores (unknown robot, no cell, etc.) is also skipped silently.
- Never throw because of a line.

## Output

- `REPORT` writes the report to stdout using the shared formatter (Report format in `log-entry.md`), one robot per line.
- Nothing else is written to stdout.

## Expected output

- `scenarios/expected/<name>-report.txt` holds the expected stdout for `scenarios/<name>.txt`: the output of every `REPORT` in that run, in order.
- The runner does not read these files. Tests compare against them.

## Testing

Every behavioral rule above has at least one test. Add or change a rule → add or change its test.

- Each `scenarios/<name>.txt` with a matching `expected/<name>-report.txt` is run, and stdout equals the file. Normalize CRLF to LF and ignore a trailing newline.
- Parser: blank and `#` lines are skipped; mixed case parses; CRLF and LF both work; whitespace around commas; multi-command `QUEUE`; defaults for `FLOOR` and `TICK`.
- Invalid keyword, missing or invalid params, and extra tokens are skipped silently. Later lines still run.
- A run starts on a new 5x5 floor and never touches the `DB_PATH` DB.
- No floor or robots remain after the run.
- Path resolution: absolute, existing relative, and a bare name found in `scenarios/`. A missing file → stderr and a non-zero exit.
- `REPORT` is the only stdout output.
