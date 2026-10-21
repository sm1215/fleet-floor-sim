import { IsInt, Max, Min } from 'class-validator';
import { Direction } from '../../shared/types.js';

export class CreateRobotDto {
  @IsInt()
  @Min(Direction.N)
  @Max(Direction.W)
  direction: Direction;

  @IsInt()
  cellId: number;
}
