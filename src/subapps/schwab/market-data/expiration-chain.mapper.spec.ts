import {
  mapExpirationList,
  osiExpirationToDateKey,
} from './expiration-chain.mapper';

describe('mapExpirationList', () => {
  it('returns ascending dates from today onward, capped at limit', () => {
    const dates = mapExpirationList(
      {
        expirationList: [
          { expirationDate: '2026-09-03' },
          { expirationDate: '2026-09-05' },
          { expirationDate: '2026-09-04' },
          { expirationDate: '2026-09-11' },
        ],
      },
      { todayEt: '2026-09-04', limit: 10 },
    );
    expect(dates).toEqual(['2026-09-04', '2026-09-05', '2026-09-11']);
  });

  it('drops past dates and dedupes', () => {
    const dates = mapExpirationList(
      {
        expirationList: [
          { expirationDate: '2026-09-01' },
          { expirationDate: '2026-09-04' },
          { expiration: '2026-09-04T00:00:00' },
        ],
      },
      { todayEt: '2026-09-04', limit: 10 },
    );
    expect(dates).toEqual(['2026-09-04']);
  });

  it('caps at limit', () => {
    const list = Array.from({ length: 20 }, (_, i) => ({
      expirationDate: `2026-09-${String(4 + i).padStart(2, '0')}`,
    }));
    const dates = mapExpirationList(
      { expirationList: list },
      { todayEt: '2026-09-04', limit: 10 },
    );
    expect(dates).toHaveLength(10);
    expect(dates[0]).toBe('2026-09-04');
  });
});

describe('osiExpirationToDateKey', () => {
  it('parses OCC YYMMDD from OSI', () => {
    expect(osiExpirationToDateKey('SPY   260904C00770000')).toBe('2026-09-04');
    expect(osiExpirationToDateKey('SPXW  260911P05800000')).toBe('2026-09-11');
  });
});
