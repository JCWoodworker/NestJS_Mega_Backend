import { OrderInstruction } from './enums/order-instruction.enum';
import { applyMarketableLimitOffset } from './marketable-limit.util';

describe('applyMarketableLimitOffset', () => {
  it('returns the original price when no slippage tolerance is given', () => {
    expect(applyMarketableLimitOffset(0.64, OrderInstruction.BUY_TO_OPEN)).toBe(
      0.64,
    );
  });

  it('walks buy orders up by the slippage tolerance', () => {
    expect(
      applyMarketableLimitOffset(0.64, OrderInstruction.BUY_TO_OPEN, 0.05),
    ).toBeCloseTo(0.69);
    expect(
      applyMarketableLimitOffset(0.64, OrderInstruction.BUY_TO_CLOSE, 0.05),
    ).toBeCloseTo(0.69);
  });

  it('walks sell orders down by the slippage tolerance', () => {
    expect(
      applyMarketableLimitOffset(0.64, OrderInstruction.SELL_TO_CLOSE, 0.05),
    ).toBeCloseTo(0.59);
    expect(
      applyMarketableLimitOffset(0.64, OrderInstruction.SELL_TO_OPEN, 0.05),
    ).toBeCloseTo(0.59);
  });

  it('floors sell orders at $0.01 instead of going negative', () => {
    expect(
      applyMarketableLimitOffset(0.02, OrderInstruction.SELL_TO_CLOSE, 0.05),
    ).toBe(0.01);
  });
});
