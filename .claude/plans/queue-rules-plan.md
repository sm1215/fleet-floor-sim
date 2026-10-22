# Plan: add `.claude/rules/queue.md`
Source: `.claude/plans/queue-plan.md`.
- Create `.claude/rules/queue.md` scoped to `apps/queue/**`. `doNext()` returns a promise, reads robots in ascending displayId order, takes each robot's oldest queued command, parses it and returns it (the Engine executes it), and deletes each command it takes whether it later succeeds or fails. Include a Testing section.
- Make `commands.md` (tick execution) and `engine.md` (step) say that `doNext()` returns the commands and the Engine executes them.
- `CLAUDE.md`: add `apps/queue/` to the folder structure and `queue.md` to the Rules files list.
