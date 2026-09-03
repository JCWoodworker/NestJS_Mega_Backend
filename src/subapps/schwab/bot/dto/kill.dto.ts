import { IsEnum } from 'class-validator';

import { KillScope } from '../enums/kill-scope.enum';

export class KillDto {
  @IsEnum(KillScope)
  scope: KillScope;
}
