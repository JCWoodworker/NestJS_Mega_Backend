/**
 * SPXW is the weekly option root. Schwab quotes, charts, and lists the chain
 * for the S&P 500 index under `$SPX`. Asking those endpoints for `SPXW`
 * returns an empty chart and a rejected chain.
 */
export function schwabIndexQuoteSymbol(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  if (upper === 'SPX' || upper === 'SPXW') return '$SPX';
  return upper;
}

/** 0DTE SPX contracts trade under the SPXW root, not SPX. */
export function schwabOptionRoot(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  if (upper === 'SPX' || upper === 'SPXW') return 'SPXW';
  return upper;
}
