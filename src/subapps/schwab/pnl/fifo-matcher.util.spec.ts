import { FillInstruction } from './enums/fill-instruction.enum';
import { OrderSource } from './enums/order-source.enum';
import { TradeDirection } from './enums/trade-direction.enum';
import {
  computeTradingPnl,
  FifoFillInput,
  matchFills,
} from './fifo-matcher.util';

function fill(
  partial: Partial<FifoFillInput> &
    Pick<FifoFillInput, 'id' | 'instruction' | 'quantity' | 'price'>,
): FifoFillInput {
  return {
    symbol: 'SPY',
    transactionDate: new Date('2026-09-03T14:00:00Z'),
    positionEffect: null,
    ...partial,
  };
}

describe('matchFills', () => {
  it('matches a simple long round-trip', () => {
    const matches = matchFills([
      fill({
        id: '1',
        instruction: FillInstruction.BUY,
        quantity: 10,
        price: 100,
        transactionDate: new Date('2026-09-03T14:00:00Z'),
      }),
      fill({
        id: '2',
        instruction: FillInstruction.SELL,
        quantity: 10,
        price: 105,
        transactionDate: new Date('2026-09-03T15:00:00Z'),
      }),
    ]);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      direction: TradeDirection.LONG,
      quantity: 10,
      openPrice: 100,
      closePrice: 105,
      realizedPnl: 50,
      openFillId: '1',
      closeFillId: '2',
    });
  });

  it('matches a short round-trip', () => {
    const matches = matchFills([
      fill({
        id: '1',
        instruction: FillInstruction.SELL,
        quantity: 5,
        price: 50,
        transactionDate: new Date('2026-09-03T14:00:00Z'),
      }),
      fill({
        id: '2',
        instruction: FillInstruction.BUY,
        quantity: 5,
        price: 40,
        transactionDate: new Date('2026-09-03T15:00:00Z'),
      }),
    ]);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      direction: TradeDirection.SHORT,
      quantity: 5,
      realizedPnl: 50,
    });
  });

  it('handles partial fills against FIFO lots', () => {
    const matches = matchFills([
      fill({
        id: '1',
        instruction: FillInstruction.BUY,
        quantity: 10,
        price: 100,
        transactionDate: new Date('2026-09-03T14:00:00Z'),
      }),
      fill({
        id: '2',
        instruction: FillInstruction.BUY,
        quantity: 10,
        price: 110,
        transactionDate: new Date('2026-09-03T14:30:00Z'),
      }),
      fill({
        id: '3',
        instruction: FillInstruction.SELL,
        quantity: 15,
        price: 120,
        transactionDate: new Date('2026-09-03T15:00:00Z'),
      }),
    ]);

    expect(matches).toHaveLength(2);
    // First lot (10 @ 100) fully closed: +200
    expect(matches[0].realizedPnl).toBe(200);
    expect(matches[0].quantity).toBe(10);
    // Second lot (5 of 10 @ 110) partially closed: +50
    expect(matches[1].realizedPnl).toBe(50);
    expect(matches[1].quantity).toBe(5);
    expect(matches[1].openFillId).toBe('2');
  });

  it('applies the 100x multiplier for option OSI symbols', () => {
    const symbol = 'SPY   260903C00770000';
    const matches = matchFills([
      fill({
        id: '1',
        symbol,
        instruction: FillInstruction.BUY,
        quantity: 1,
        price: 1.0,
        transactionDate: new Date('2026-09-03T14:00:00Z'),
      }),
      fill({
        id: '2',
        symbol,
        instruction: FillInstruction.SELL,
        quantity: 1,
        price: 1.5,
        transactionDate: new Date('2026-09-03T15:00:00Z'),
      }),
    ]);

    expect(matches).toHaveLength(1);
    expect(matches[0].realizedPnl).toBe(50); // (1.5-1.0)*1*100
  });

  it('leaves unmatched open lots out of the result', () => {
    const matches = matchFills([
      fill({
        id: '1',
        instruction: FillInstruction.BUY,
        quantity: 3,
        price: 10,
      }),
    ]);
    expect(matches).toHaveLength(0);
  });

  it('matches same-day round trips independently per symbol', () => {
    const matches = matchFills([
      fill({
        id: 'a1',
        symbol: 'SPY',
        instruction: FillInstruction.BUY,
        quantity: 1,
        price: 100,
        transactionDate: new Date('2026-09-03T14:00:00Z'),
      }),
      fill({
        id: 'b1',
        symbol: 'QQQ',
        instruction: FillInstruction.BUY,
        quantity: 2,
        price: 50,
        transactionDate: new Date('2026-09-03T14:00:00Z'),
      }),
      fill({
        id: 'a2',
        symbol: 'SPY',
        instruction: FillInstruction.SELL,
        quantity: 1,
        price: 101,
        transactionDate: new Date('2026-09-03T14:05:00Z'),
      }),
      fill({
        id: 'b2',
        symbol: 'QQQ',
        instruction: FillInstruction.SELL,
        quantity: 2,
        price: 49,
        transactionDate: new Date('2026-09-03T14:05:00Z'),
      }),
    ]);

    expect(matches).toHaveLength(2);
    const spy = matches.find((m) => m.symbol === 'SPY')!;
    const qqq = matches.find((m) => m.symbol === 'QQQ')!;
    expect(spy.realizedPnl).toBe(1);
    expect(qqq.realizedPnl).toBe(-2);
  });

  it('defaults unset source to MANUAL_LIVE on the resulting match', () => {
    const matches = matchFills([
      fill({
        id: '1',
        instruction: FillInstruction.BUY,
        quantity: 1,
        price: 10,
      }),
      fill({
        id: '2',
        instruction: FillInstruction.SELL,
        quantity: 1,
        price: 11,
        transactionDate: new Date('2026-09-03T15:00:00Z'),
      }),
    ]);
    expect(matches[0].source).toBe(OrderSource.MANUAL_LIVE);
  });

  it('never cross-matches fills from different sources on the same symbol', () => {
    const matches = matchFills([
      fill({
        id: 'bot-open',
        instruction: FillInstruction.BUY,
        quantity: 1,
        price: 1.0,
        transactionDate: new Date('2026-09-03T14:00:00Z'),
        source: OrderSource.BOT_LIVE,
      }),
      fill({
        id: 'manual-open',
        instruction: FillInstruction.BUY,
        quantity: 1,
        price: 2.0,
        transactionDate: new Date('2026-09-03T14:01:00Z'),
        source: OrderSource.MANUAL_LIVE,
      }),
      // Only the BOT_LIVE lot has a matching close — the MANUAL_LIVE lot
      // must remain open (unmatched), not get closed against this fill.
      fill({
        id: 'bot-close',
        instruction: FillInstruction.SELL,
        quantity: 1,
        price: 1.5,
        transactionDate: new Date('2026-09-03T14:30:00Z'),
        source: OrderSource.BOT_LIVE,
      }),
    ]);

    expect(matches).toHaveLength(1);
    expect(matches[0].source).toBe(OrderSource.BOT_LIVE);
    expect(matches[0].openFillId).toBe('bot-open');
    expect(matches[0].closeFillId).toBe('bot-close');
  });

  it('partitions BOT_PAPER fills into their own realized-trade ledger', () => {
    const symbol = 'SPY   260903C00770000';
    const matches = matchFills([
      fill({
        id: '1',
        symbol,
        instruction: FillInstruction.BUY,
        quantity: 2,
        price: 1.0,
        transactionDate: new Date('2026-09-03T14:00:00Z'),
        source: OrderSource.BOT_PAPER,
      }),
      fill({
        id: '2',
        symbol,
        instruction: FillInstruction.SELL,
        quantity: 2,
        price: 1.2,
        transactionDate: new Date('2026-09-03T14:10:00Z'),
        source: OrderSource.BOT_PAPER,
      }),
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0].source).toBe(OrderSource.BOT_PAPER);
    expect(matches[0].realizedPnl).toBeCloseTo(40, 5); // (1.2-1.0)*2*100
  });
});

describe('computeTradingPnl', () => {
  it('subtracts net transfers from equity change', () => {
    // equity rose 1000 but 400 was a deposit → trading pnl = 600
    expect(computeTradingPnl(10_000, 11_000, 400)).toBe(600);
    // equity flat but withdrew 200 → trading pnl = +200 (withdrawal of profits)
    expect(computeTradingPnl(10_000, 10_000, -200)).toBe(200);
    // equity rose exactly by a deposit → trading pnl = 0
    expect(computeTradingPnl(10_000, 10_500, 500)).toBe(0);
  });
});
