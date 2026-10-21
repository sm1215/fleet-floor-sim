import { IsIn, IsInt, IsString } from 'class-validator';
import { COMMANDS } from '../../shared/types.js';
import type { Command } from '../../shared/types.js';

export class CreateQueuedCommandDto {
  @IsIn(COMMANDS)
  command: Command;

  @IsString()
  params: string;

  @IsInt()
  robotId: number;
}
