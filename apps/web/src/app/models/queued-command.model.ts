export type CommandName = 'MOVE' | 'LEFT' | 'RIGHT';

export interface QueuedCommand {
  id: number;
  /** GOTO carries its target in params (`3,4`). */
  command: CommandName | 'GOTO';
  params: string | null;
  robotId: number;
}
