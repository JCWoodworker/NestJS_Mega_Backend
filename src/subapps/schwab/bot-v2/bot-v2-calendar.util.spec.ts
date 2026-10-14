import {
  buildTrainerMonth,
  paintPaperOntoDay,
  percentOf,
  topUpAmount,
  normalizeNote,
  weekdayMon0,
} from './bot-v2-calendar.util';

describe('trainer calendar', () => {
  it('shows a past day in dollars and hides the percent before a baseline', () => {
    const view = buildTrainerMonth({
      month: '2026-10',
      today: '2026-10-14',
      closes: [{ at: 1, etDate: '2026-10-06', netPnl: -492.1 }],
      marks: [],
    });
    const day = view.weeks.flatMap((week) => week.days).find((item) => item.date === '2026-10-06');
    expect(day?.empty).toBe(false);
    expect(day?.pnl).toBe(-492.1);
    expect(day?.percent).toBeNull();
    expect(view.percent).toBeNull();
  });

  it('starts the percent the session after the baseline', () => {
    const view = buildTrainerMonth({
      month: '2026-10',
      today: '2026-10-16',
      closes: [
        { at: 100, etDate: '2026-10-14', netPnl: 50 },
        { at: 300, etDate: '2026-10-15', netPnl: 100 },
      ],
      marks: [
        { kind: 'BASELINE', at: 200, etDate: '2026-10-14', amount: 0, balanceAfter: 9000 },
      ],
    });
    const baselineDay = view.weeks
      .flatMap((week) => week.days)
      .find((item) => item.date === '2026-10-14');
    const next = view.weeks.flatMap((week) => week.days).find((item) => item.date === '2026-10-15');
    expect(baselineDay?.percent).toBeNull();
    expect(next?.startEquity).toBe(9000);
    expect(next?.pnl).toBe(100);
    expect(next?.percent).toBe(1.1);
  });

  it('hides the percent when the base is not positive', () => {
    expect(percentOf(-20, 0)).toBeNull();
    expect(percentOf(-20, -5)).toBeNull();
    expect(topUpAmount(10_000)).toBeNull();
    expect(topUpAmount(8_000)).toBe(2000);
  });

  it('clears a blank note and keeps Monday as the week start', () => {
    expect(normalizeNote('  ')).toBeNull();
    expect(normalizeNote(' choppy ')).toBe('choppy');
    expect(weekdayMon0('2026-10-14')).toBe(2);
  });

  it('paints a sim close onto an empty day and keeps the paper slice', () => {
    const painted = paintPaperOntoDay(
      {
        date: '2026-10-14',
        empty: true,
        pnl: null,
        percent: null,
        books: undefined,
      },
      42.5,
      true,
    );
    expect(painted.empty).toBe(false);
    expect(painted.pnl).toBe(42.5);
    expect(painted.books?.[0]?.book).toBe('manual_paper');
    expect(painted.books?.[0]?.pnl).toBe(42.5);
  });
});
