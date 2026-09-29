import { pushPriceBar } from './bot-v2-bars.util';

describe('pushPriceBar', () => {
  it('closes the previous 15-second bucket when the clock steps', () => {
    const first = pushPriceBar(null, 100, 0, 15);
    const second = pushPriceBar(first.current, 102, 5_000, 15);
    const third = pushPriceBar(second.current, 99, 15_000, 15);

    expect(second.closed).toBeNull();
    expect(second.current).toMatchObject({ high: 102, close: 102, volume: 2 });
    expect(third.closed).toMatchObject({
      chartTime: 0,
      open: 100,
      high: 102,
      close: 102,
    });
    expect(third.current.chartTime).toBe(15_000);
    expect(third.current.open).toBe(99);
  });
});
