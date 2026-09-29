/** First scale sells half once the bid is 10% above the entry. */
export const SCALE_OUT_GAIN = 1.1;

export function scaleOutQuantity(quantity: number): number {
  if (quantity < 2) return 0;
  return Math.floor(quantity / 2);
}

export function shouldScaleOut(input: {
  enabled: boolean;
  scaledOut: boolean;
  quantity: number;
  entryPremium: number;
  bid: number;
}): boolean {
  if (!input.enabled || input.scaledOut) return false;
  if (scaleOutQuantity(input.quantity) < 1) return false;
  if (!(input.entryPremium > 0) || !(input.bid > 0)) return false;
  return input.bid >= input.entryPremium * SCALE_OUT_GAIN;
}
