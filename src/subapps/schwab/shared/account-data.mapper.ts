/**
 * Normalizes Schwab's `/trader/v1/accounts/{accountHash}?fields=positions`
 * response into the shapes this backend hands to the frontend (both over
 * the `account-snapshot` socket event and the on-demand REST endpoints).
 * Field names vary between cash and margin accounts on Schwab's API, so
 * every field falls back across the documented aliases rather than
 * assuming one shape.
 */

export interface AccountBalances {
  equity: number;
  settledCash: number;
  optionsBuyingPower: number;
}

export interface PositionSnapshot {
  /** 21-char OSI symbol for options, plain ticker for equities. */
  symbol: string;
  assetType: string;
  /** Positive = net long, negative = net short. */
  quantity: number;
  averagePrice: number;
  marketValue: number;
  dayProfitLoss: number;
}

export function mapAccountBalances(
  schwabAccountResponse: any,
): AccountBalances {
  const balances =
    schwabAccountResponse?.securitiesAccount?.currentBalances ?? {};

  return {
    equity: balances.equity ?? balances.liquidationValue ?? 0,
    settledCash: balances.cashAvailableForTrading ?? balances.cashBalance ?? 0,
    optionsBuyingPower: balances.optionBuyingPower ?? balances.buyingPower ?? 0,
  };
}

export function mapAccountPositions(
  schwabAccountResponse: any,
): PositionSnapshot[] {
  const positions = schwabAccountResponse?.securitiesAccount?.positions ?? [];

  return positions.map((position: any) => ({
    symbol: position.instrument?.symbol ?? '',
    assetType: position.instrument?.assetType ?? 'UNKNOWN',
    quantity: (position.longQuantity ?? 0) - (position.shortQuantity ?? 0),
    averagePrice:
      position.averagePrice ??
      position.averageLongPrice ??
      position.averageShortPrice ??
      0,
    marketValue: position.marketValue ?? 0,
    dayProfitLoss: position.currentDayProfitLoss ?? 0,
  }));
}
