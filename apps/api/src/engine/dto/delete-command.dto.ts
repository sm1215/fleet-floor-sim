import { Matches } from 'class-validator';
import { RID_MESSAGE, RID_PATTERN } from './rid.js';

export class DeleteCommandDto {
  @Matches(RID_PATTERN, { message: RID_MESSAGE })
  rId: string;
}
