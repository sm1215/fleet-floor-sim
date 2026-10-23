import { IsInt } from 'class-validator';

/** The Engine checks that the floor exists. */
export class SelectFloorDto {
  @IsInt()
  floorId: number;
}
