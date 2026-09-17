/**
 * Per-contract option commission, charged on each leg.
 *
 * Paper fills previously modeled slippage but no commission, which biases every
 * "should have exited sooner" conclusion toward overtrading — a scalper's edge
 * is small enough that fees decide whether it exists. Schwab is $0.65/contract
 * at the time of writing; override per environment if that changes.
 */
export const OPTION_COMMISSION_PER_CONTRACT =
  Number(process.env.SCHWAB_OPTION_COMMISSION_PER_CONTRACT) || 0.65;

/** Commission for one leg (entry or exit) of `quantity` contracts. */
export function commissionForLeg(quantity: number): number {
  return round2(Math.max(0, quantity) * OPTION_COMMISSION_PER_CONTRACT);
}

/** Commission for a complete round trip. */
export function commissionForRoundTrip(quantity: number): number {
  return round2(commissionForLeg(quantity) * 2);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
