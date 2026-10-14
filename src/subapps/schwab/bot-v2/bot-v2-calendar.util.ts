export const CALENDAR_BOOKS = [
  'trainer',
  'manual_live',
  'manual_paper',
  'bot_live',
  'bot_paper',
] as const;

export type CalendarBook = (typeof CALENDAR_BOOKS)[number];
export type CalendarBookQuery = CalendarBook | 'all';

export type CalendarClose = {
  at: number;
  etDate: string;
  netPnl: number;
};

export type CalendarMark = {
  kind: 'BASELINE' | 'TOP_UP';
  at: number;
  etDate: string;
  amount: number;
  balanceAfter: number;
};

export type CalendarDay = {
  date: string;
  outside: boolean;
  empty: boolean;
  pnl: number | null;
  startEquity: number | null;
  added: number;
  percent: number | null;
};

export type CalendarWeek = {
  monday: string;
  pnl: number | null;
  startEquity: number | null;
  added: number;
  percent: number | null;
  days: CalendarDay[];
};

export type CalendarMonthView = {
  pnl: number | null;
  startEquity: number | null;
  added: number;
  percent: number | null;
  weeks: CalendarWeek[];
};

const MONTH = /^\d{4}-\d{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarBook(value: string): value is CalendarBook {
  return (CALENDAR_BOOKS as readonly string[]).includes(value);
}

export function isMonthKey(value: string): boolean {
  if (!MONTH.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

export function isDayKey(value: string): boolean {
  if (!DAY.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  return utc.getUTCFullYear() === y && utc.getUTCMonth() === m - 1 && utc.getUTCDate() === d;
}

/** Monday = 0 … Sunday = 6, for a date that is already an Eastern calendar day. */
export function weekdayMon0(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const sun0 = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (sun0 + 6) % 7;
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function mondayOf(dateKey: string): string {
  return addDays(dateKey, -weekdayMon0(dateKey));
}

export function isMonday(dateKey: string): boolean {
  return isDayKey(dateKey) && weekdayMon0(dateKey) === 0;
}

/** Blank text clears the note. */
export function normalizeNote(text: string | null | undefined): string | null {
  const trimmed = text?.trim() ?? '';
  return trimmed.length ? trimmed : null;
}

/** A reset that is already at the target adds nothing. */
export function topUpAmount(balanceBefore: number, balanceAfter = 10_000): number | null {
  const amount = round2(balanceAfter - balanceBefore);
  return amount === 0 ? null : amount;
}

export function percentOf(pnl: number, base: number | null): number | null {
  if (base == null || base <= 0) return null;
  return Math.round((pnl / base) * 1000) / 10;
}

export function buildTrainerMonth(input: {
  month: string;
  today: string;
  closes: CalendarClose[];
  marks: CalendarMark[];
}): CalendarMonthView {
  const baseline = input.marks.find((mark) => mark.kind === 'BASELINE') ?? null;
  const topUps = input.marks.filter((mark) => mark.kind === 'TOP_UP');
  const firstClose = input.closes.reduce<string | null>(
    (earliest, close) =>
      earliest == null || close.etDate < earliest ? close.etDate : earliest,
    null,
  );
  const started = firstClose ?? baseline?.etDate ?? null;
  const weeks = monthWeeks(input.month).map((dates) => {
    const days = dates.map((date) =>
      dayView(date, input.month, input.today, started, baseline, input.closes, topUps),
    );
    return rollWeek(dates[0], days);
  });
  const inMonth = weeks
    .flatMap((week) => week.days)
    .filter((day) => !day.outside && !day.empty);
  const monthStart = startEquity(`${input.month}-01`, baseline, input.closes, topUps);
  const monthAdded = round2(
    topUps
      .filter((mark) => mark.etDate.startsWith(input.month))
      .reduce((sum, mark) => sum + mark.amount, 0),
  );
  const monthPnl = round2(inMonth.reduce((sum, day) => sum + (day.pnl ?? 0), 0));
  const hasMonth = started != null && inMonth.some((day) => day.date.startsWith(input.month));
  return {
    pnl: hasMonth || inMonth.length ? monthPnl : null,
    startEquity: monthStart,
    added: monthAdded,
    percent: percentOf(monthPnl, monthStart == null ? null : monthStart + monthAdded),
    weeks,
  };
}

function dayView(
  date: string,
  month: string,
  today: string,
  started: string | null,
  baseline: CalendarMark | null,
  closes: CalendarClose[],
  topUps: CalendarMark[],
): CalendarDay {
  const outside = !date.startsWith(month);
  const empty = started == null || date < started || date > today;
  if (empty) {
    return {
      date,
      outside,
      empty: true,
      pnl: null,
      startEquity: null,
      added: 0,
      percent: null,
    };
  }
  const pnl = round2(
    closes.filter((close) => close.etDate === date).reduce((sum, close) => sum + close.netPnl, 0),
  );
  const added = round2(
    topUps.filter((mark) => mark.etDate === date).reduce((sum, mark) => sum + mark.amount, 0),
  );
  const start = startEquity(date, baseline, closes, topUps);
  const base = start == null ? null : start + added;
  return {
    date,
    outside,
    empty: false,
    pnl,
    startEquity: start,
    added,
    percent: percentOf(pnl, base),
  };
}

function rollWeek(monday: string, days: CalendarDay[]): CalendarWeek {
  const lived = days.filter((day) => !day.empty);
  const pnl = lived.length ? round2(lived.reduce((sum, day) => sum + (day.pnl ?? 0), 0)) : null;
  const added = round2(days.reduce((sum, day) => sum + day.added, 0));
  const startEquity = days[0]?.startEquity ?? null;
  return {
    monday,
    pnl,
    startEquity,
    added,
    percent: pnl == null ? null : percentOf(pnl, startEquity == null ? null : startEquity + added),
    days,
  };
}

function startEquity(
  date: string,
  baseline: CalendarMark | null,
  closes: CalendarClose[],
  topUps: CalendarMark[],
): number | null {
  if (!baseline || date <= baseline.etDate) return null;
  let equity = baseline.balanceAfter;
  for (const close of closes) {
    if (close.at > baseline.at && close.etDate < date) equity += close.netPnl;
  }
  for (const topUp of topUps) {
    if (topUp.at > baseline.at && topUp.etDate < date) equity += topUp.amount;
  }
  return round2(equity);
}

function monthWeeks(month: string): string[][] {
  const first = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const weeks: string[][] = [];
  let cursor = addDays(first, -weekdayMon0(first));
  while (cursor <= last) {
    weeks.push([0, 1, 2, 3, 4].map((offset) => addDays(cursor, offset)));
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
