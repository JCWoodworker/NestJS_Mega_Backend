import {
  mapOrderUpdate,
  mapWorkingOrders,
  orderUpdateFingerprint,
} from './working-order.mapper';

const rawOrder = (overrides: Record<string, unknown> = {}) => ({
  orderId: 1003559649,
  status: 'WORKING',
  orderType: 'STOP',
  quantity: 2,
  filledQuantity: 0,
  price: null,
  stopPrice: 1.25,
  enteredTime: '2026-09-02T14:30:00+0000',
  orderLegCollection: [
    {
      instruction: 'SELL_TO_CLOSE',
      quantity: 2,
      instrument: { symbol: 'SPY   260902C00565000' },
    },
  ],
  ...overrides,
});

describe('mapWorkingOrders', () => {
  it('returns an empty array for a non-array response', () => {
    expect(mapWorkingOrders(undefined as unknown as any[])).toEqual([]);
  });

  it('maps a Schwab STOP order into the documented working-order shape', () => {
    const [order] = mapWorkingOrders([rawOrder()]);

    expect(order).toEqual({
      orderId: '1003559649',
      symbol: 'SPY   260902C00565000',
      instruction: 'SELL_TO_CLOSE',
      quantity: 2,
      filledQuantity: 0,
      orderType: 'STOP',
      status: 'WORKING',
      price: null,
      stopPrice: 1.25,
      enteredTime: '2026-09-02T14:30:00+0000',
    });
  });

  it('falls back to defaults when fields are missing', () => {
    const [order] = mapWorkingOrders([{}]);

    expect(order).toEqual({
      orderId: '',
      symbol: '',
      instruction: '',
      quantity: 0,
      filledQuantity: 0,
      orderType: '',
      status: '',
      price: null,
      stopPrice: null,
      enteredTime: null,
    });
  });
});

describe('mapOrderUpdate', () => {
  it('maps a still-working order with no fills to a null averageFillPrice', () => {
    const update = mapOrderUpdate(rawOrder());

    expect(update).toEqual({
      orderId: '1003559649',
      symbol: 'SPY   260902C00565000',
      status: 'WORKING',
      orderType: 'STOP',
      stopPrice: 1.25,
      price: null,
      filledQuantity: 0,
      averageFillPrice: null,
    });
  });

  it('computes a quantity-weighted average fill price across execution legs', () => {
    const update = mapOrderUpdate(
      rawOrder({
        status: 'FILLED',
        filledQuantity: 2,
        orderActivityCollection: [
          {
            activityType: 'EXECUTION',
            executionLegs: [
              { quantity: 1, price: 1.2 },
              { quantity: 1, price: 1.3 },
            ],
          },
        ],
      }),
    );

    expect(update.averageFillPrice).toBeCloseTo(1.25);
    expect(update.status).toBe('FILLED');
  });
});

describe('orderUpdateFingerprint', () => {
  it('produces the same fingerprint for identical updates', () => {
    const update = mapOrderUpdate(rawOrder());
    expect(orderUpdateFingerprint(update)).toBe(orderUpdateFingerprint(update));
  });

  it('changes when status changes', () => {
    const working = orderUpdateFingerprint(mapOrderUpdate(rawOrder()));
    const canceled = orderUpdateFingerprint(
      mapOrderUpdate(rawOrder({ status: 'CANCELED' })),
    );
    expect(working).not.toBe(canceled);
  });
});
