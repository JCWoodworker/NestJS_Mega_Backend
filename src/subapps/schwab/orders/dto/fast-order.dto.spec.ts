import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { FastOrderDto } from './fast-order.dto';
import { OrderInstruction, OrderType } from '../enums/order-instruction.enum';

const baseOrder = {
  accountHash: 'ABC123',
  symbol: 'SPY   260902C00565000',
  instruction: OrderInstruction.SELL_TO_CLOSE,
  quantity: 1,
};

async function validateOrder(overrides: Record<string, unknown>) {
  const dto = plainToInstance(FastOrderDto, { ...baseOrder, ...overrides });
  return validate(dto);
}

describe('FastOrderDto', () => {
  it('passes for a MARKET order with no price/stopPrice', async () => {
    const errors = await validateOrder({ orderType: OrderType.MARKET });
    expect(errors).toHaveLength(0);
  });

  it('passes for a LIMIT order with a price', async () => {
    const errors = await validateOrder({
      orderType: OrderType.LIMIT,
      price: 1.1,
    });
    expect(errors).toHaveLength(0);
  });

  it('fails a LIMIT order missing price', async () => {
    const errors = await validateOrder({ orderType: OrderType.LIMIT });
    expect(errors.some((e) => e.property === 'price')).toBe(true);
  });

  it('passes a STOP order with stopPrice only', async () => {
    const errors = await validateOrder({
      orderType: OrderType.STOP,
      stopPrice: 1.25,
    });
    expect(errors).toHaveLength(0);
  });

  it('fails a STOP order missing stopPrice', async () => {
    const errors = await validateOrder({ orderType: OrderType.STOP });
    expect(errors.some((e) => e.property === 'stopPrice')).toBe(true);
  });

  it('passes a STOP_LIMIT order with both price and stopPrice', async () => {
    const errors = await validateOrder({
      orderType: OrderType.STOP_LIMIT,
      price: 1.2,
      stopPrice: 1.25,
    });
    expect(errors).toHaveLength(0);
  });

  it('fails a STOP_LIMIT order missing price', async () => {
    const errors = await validateOrder({
      orderType: OrderType.STOP_LIMIT,
      stopPrice: 1.25,
    });
    expect(errors.some((e) => e.property === 'price')).toBe(true);
  });

  it('fails a STOP_LIMIT order missing stopPrice', async () => {
    const errors = await validateOrder({
      orderType: OrderType.STOP_LIMIT,
      price: 1.2,
    });
    expect(errors.some((e) => e.property === 'stopPrice')).toBe(true);
  });

  it('ignores stopPrice being absent on a plain LIMIT order', async () => {
    const errors = await validateOrder({
      orderType: OrderType.LIMIT,
      price: 1.1,
    });
    expect(errors.some((e) => e.property === 'stopPrice')).toBe(false);
  });
});
