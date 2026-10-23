import { IsInt } from 'class-validator';

export class ObstacleCommandDto {
  @IsInt()
  x: number;

  @IsInt()
  y: number;
}
