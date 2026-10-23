import { IsInt, Min } from 'class-validator';

/** The Engine checks the upper bound (the floor's currentTick). */
export class ForkFloorDto {
  @IsInt()
  @Min(0)
  tick: number;
}
