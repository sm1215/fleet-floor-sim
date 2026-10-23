import type { EntityManager } from 'typeorm';
import type { LogLine } from '../log-entry/log-params.js';

/** Outcome of an Engine command: applied (with its log line), or ignored with the reason. */
export type CommandResult =
  { ok: true; log?: LogLine } | { ok: false; reason: string };

/**
 * Writes a log line inside the command's transaction. If it throws, the
 * command rolls back, so no change is saved without its entry.
 */
export type Recorder = (manager: EntityManager, line: LogLine) => Promise<void>;
