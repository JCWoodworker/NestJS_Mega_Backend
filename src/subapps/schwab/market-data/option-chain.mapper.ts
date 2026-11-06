/**
 * Normalizes Schwab's `GET /marketdata/v1/chains` response into a flat
 * array shaped like `option-ticks` (frontend contract section 11b), so the
 * frontend can reuse its existing ladder-merge path for both the snapshot
 * and the live socket stream.
 */
export interface OptionChainQuote {
  /** 21-char OSI symbol, same padding as `ladder-recentered`. */
  symbol: string;
  bid: number | null;
  ask: number | null;
  last: number | null;
  bidSize: number | null;
  askSize: number | null;
  volume: number | null;
  delta: number | null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function mapContract(contract: any): OptionChainQuote | null {
  if (!contract?.symbol) return null;

  return {
    symbol: contract.symbol,
    bid: toNullableNumber(contract.bid),
    ask: toNullableNumber(contract.ask),
    last: toNullableNumber(contract.last),
    bidSize: toNullableNumber(contract.bidSize),
    askSize: toNullableNumber(contract.askSize),
    volume: toNullableNumber(contract.totalVolume),
    delta: toNullableNumber(contract.delta),
  };
}

/**
 * Schwab groups contracts as `{ callExpDateMap, putExpDateMap }`, each keyed
 * by `"<expDate>:<daysToExpiration>"` then by strike price (as a string),
 * with an array of contracts at each strike (always length 1 in practice -
 * one contract per strike/side). Flattens all of that into one array.
 */
export function mapOptionChainResponse(
  schwabChainResponse: any,
): OptionChainQuote[] {
  const quotes: OptionChainQuote[] = [];

  for (const expDateMap of [
    schwabChainResponse?.callExpDateMap,
    schwabChainResponse?.putExpDateMap,
  ]) {
    if (!expDateMap) continue;

    for (const strikeMap of Object.values(expDateMap)) {
      for (const contracts of Object.values(strikeMap as Record<string, any>)) {
        for (const contract of contracts as any[]) {
          const quote = mapContract(contract);
          if (quote) quotes.push(quote);
        }
      }
    }
  }

  return quotes;
}

/** Schwab `GET /quotes` for explicit OSI symbols. Far strikes are not in the ATM chain. */
export function mapOptionQuotesResponse(body: unknown): OptionChainQuote[] {
  if (!body || typeof body !== 'object') return [];
  const quotes: OptionChainQuote[] = [];
  for (const [key, row] of Object.entries(body as Record<string, any>)) {
    const quote = row?.quote ?? row;
    const symbol =
      typeof row?.symbol === 'string' && row.symbol ? row.symbol : key;
    if (!symbol || symbol === 'errors') continue;
    quotes.push({
      symbol,
      bid: toNullableNumber(quote?.bidPrice ?? quote?.bid),
      ask: toNullableNumber(quote?.askPrice ?? quote?.ask),
      last: toNullableNumber(quote?.lastPrice ?? quote?.last),
      bidSize: toNullableNumber(quote?.bidSize),
      askSize: toNullableNumber(quote?.askSize),
      volume: toNullableNumber(quote?.totalVolume ?? quote?.volume),
      delta: toNullableNumber(quote?.delta),
    });
  }
  return quotes;
}
