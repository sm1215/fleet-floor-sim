import { IsInt, Max, Min, ValidateIf } from 'class-validator';
import { Direction } from '../../shared/types.js';

export class CreateRobotDto {
  @IsInt()
  @Min(Direction.N)
  @Max(Direction.W)
  direction: Direction;

  @IsInt()
  cellId: number;

  /** Defaults to the new robot's id. */
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  displayId?: number;
}
