import { OrderInstruction } from './enums/order-instruction.enum';

const MIN_LIMIT_PRICE = 0.01;

/**
 * Converts a limit price into a marketable limit by walking it toward the
 * far side of the spread by `slippageTolerance`, so fast-moving 0DTE quotes
 * don't cause an order to sit unfilled at a stale price. Buys walk the
 * price up (more aggressive fill), sells walk it down, floored at $0.01.
 */
export function applyMarketableLimitOffset(
  price: number,
  instruction: OrderInstruction,
  slippageTolerance?: number,
): number {
  if (!slippageTolerance) {
    return price;
  }

  const isBuy =
    instruction === OrderInstruction.BUY_TO_OPEN ||
    instruction === OrderInstruction.BUY_TO_CLOSE;

  return isBuy
    ? price + slippageTolerance
    : Math.max(MIN_LIMIT_PRICE, price - slippageTolerance);
}
