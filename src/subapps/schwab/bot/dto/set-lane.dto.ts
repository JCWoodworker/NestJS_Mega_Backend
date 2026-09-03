import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

import { BotLane } from '../enums/bot-lane.enum';

export class SetLaneDto {
  @IsEnum(BotLane)
  lane: BotLane;

  /** Required true when lane is BOT_LIVE. */
  @IsOptional()
  @IsBoolean()
  confirmLive?: boolean;
}
