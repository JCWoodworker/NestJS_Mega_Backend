import { IsString, Matches, MaxLength } from 'class-validator';

/** US equity/ETF/index root tickers (e.g. SPY, AAPL, BRK.B). */
const UNDERLYING_PATTERN = /^[A-Za-z][A-Za-z0-9.-]{0,9}$/;

export class ExpirationsQueryDto {
  @IsString()
  @MaxLength(10)
  @Matches(UNDERLYING_PATTERN, {
    message: 'symbol must be a US ticker (e.g. SPY, AAPL, BRK.B)',
  })
  symbol: string;
}
