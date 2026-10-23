import { IsInt, Matches } from 'class-validator';
import { RID_MESSAGE, RID_PATTERN } from './rid.js';

export class GotoCommandDto {
  @Matches(RID_PATTERN, { message: RID_MESSAGE })
  rId: string;

  @IsInt()
  x: number;

  @IsInt()
  y: number;
}
