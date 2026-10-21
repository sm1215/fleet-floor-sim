import { IsBoolean, IsInt } from 'class-validator';

export class CreateCellDto {
  @IsBoolean()
  obstacle: boolean;

  @IsInt()
  xPosition: number;

  @IsInt()
  yPosition: number;

  @IsInt()
  floorId: number;
}
