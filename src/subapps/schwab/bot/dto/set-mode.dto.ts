import { IsEnum } from 'class-validator';

import { BotMode } from '../enums/bot-mode.enum';

export class SetModeDto {
  @IsEnum(BotMode)
  mode: BotMode;
}
