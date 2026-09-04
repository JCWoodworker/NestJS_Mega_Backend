import { IsBoolean } from 'class-validator';

export class SetUserLockDto {
  @IsBoolean()
  locked: boolean;
}
