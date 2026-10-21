import { IsInt, ValidateIf, Max, Min } from 'class-validator';

export class UpdateFloorDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(20)
  height?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(20)
  width?: number;
}
