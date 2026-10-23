import { ArrayNotEmpty, IsArray, IsIn, Matches } from 'class-validator';
import { COMMANDS, type Command } from '../../shared/types.js';
import { RID_MESSAGE, RID_PATTERN } from './rid.js';

export class QueueCommandDto {
  @Matches(RID_PATTERN, { message: RID_MESSAGE })
  rId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(COMMANDS, { each: true })
  commands: Command[];
}
