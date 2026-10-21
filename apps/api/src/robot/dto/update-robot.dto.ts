import { IsInt, ValidateIf, Max, Min } from 'class-validator';
import { Direction } from '../../shared/types.js';

export class UpdateRobotDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(Direction.N)
  @Max(Direction.W)
  direction?: Direction;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  cellId?: number;
}
