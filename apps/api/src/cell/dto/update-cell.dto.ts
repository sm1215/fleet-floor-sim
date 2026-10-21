import { IsBoolean, IsInt, ValidateIf } from 'class-validator';

export class UpdateCellDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  obstacle?: boolean;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  xPosition?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  yPosition?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  floorId?: number;
}
