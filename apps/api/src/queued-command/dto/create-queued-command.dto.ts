import { IsIn, IsInt, IsString, ValidateIf } from 'class-validator';
import { COMMANDS } from '../../shared/types.js';
import type { Command } from '../../shared/types.js';

export class CreateQueuedCommandDto {
  @IsIn(COMMANDS)
  command: Command;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  params?: string;

  @IsInt()
  robotId: number;
}
