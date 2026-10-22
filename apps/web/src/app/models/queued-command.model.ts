export type CommandName = 'MOVE' | 'LEFT' | 'RIGHT';

export interface QueuedCommand {
  id: number;
  command: CommandName;
  params: string | null;
  robotId: number;
}
