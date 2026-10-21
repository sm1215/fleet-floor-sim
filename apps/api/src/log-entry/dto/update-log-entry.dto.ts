import { ValidateIf, IsString } from 'class-validator';

export class UpdateLogEntryDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  action?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  params?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  result?: string;
}
