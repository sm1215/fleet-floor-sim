import { IsInt, Max, Min } from 'class-validator';

export class CreateFloorDto {
  @IsInt()
  @Min(1)
  @Max(20)
  height: number;

  @IsInt()
  @Min(1)
  @Max(20)
  width: number;
}
