import { IsIn, IsString } from 'class-validator';

const UNDERLYINGS = ['SPY', 'QQQ', 'IWM', 'SPX', 'SPXW'] as const;

export class ExpirationsQueryDto {
  @IsString()
  @IsIn([...UNDERLYINGS])
  symbol: string;
}

export { UNDERLYINGS as MARKET_DATA_UNDERLYINGS };
