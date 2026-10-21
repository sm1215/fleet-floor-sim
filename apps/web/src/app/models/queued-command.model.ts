export interface QueuedCommand {
  id: number;
  command: string;
  params: string;
  robotId: number;
}
