import { IsString } from 'class-validator';

export class CreateLogEntryDto {
  @IsString()
  action: string;

  @IsString()
  params: string;

  @IsString()
  result: string;
}
