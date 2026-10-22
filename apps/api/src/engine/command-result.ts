/** Outcome of an Engine command: applied, or ignored with the reason. */
export type CommandResult = { ok: true } | { ok: false; reason: string };
