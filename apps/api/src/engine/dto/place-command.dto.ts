import { IsIn, IsInt, IsOptional, Matches } from 'class-validator';
import { DIRECTION_NAMES } from '../../shared/types.js';
import { RID_MESSAGE, RID_PATTERN } from './rid.js';

export class PlaceCommandDto {
  /** Omitted → a new robot (Engine picks the displayId). */
  @IsOptional()
  @Matches(RID_PATTERN, { message: RID_MESSAGE })
  rId?: string;

  @IsInt()
  x: number;

  @IsInt()
  y: number;

  @IsIn(DIRECTION_NAMES)
  direction: (typeof DIRECTION_NAMES)[number];
}
