import { IsInt, IsOptional } from 'class-validator';

/** Range checks live in the Engine, which returns the reason. */
export class FloorCommandDto {
  @IsOptional()
  @IsInt()
  width?: number;

  @IsOptional()
  @IsInt()
  height?: number;
}
