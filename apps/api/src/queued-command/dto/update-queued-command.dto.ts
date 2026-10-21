import { IsIn, IsInt, ValidateIf, IsString } from 'class-validator';
import { COMMANDS } from '../../shared/types.js';
import type { Command } from '../../shared/types.js';

export class UpdateQueuedCommandDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(COMMANDS)
  command?: Command;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  params?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  robotId?: number;
}
