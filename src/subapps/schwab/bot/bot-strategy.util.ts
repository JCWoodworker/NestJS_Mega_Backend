export interface BotCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Epoch ms (chartTime). */
  chartTime: number;
}

export type SignalDirection = 'CALL' | 'PUT';

export interface OrbRange {
  high: number;
  low: number;
}

/** Session VWAP from 9:30 ET candles onward (typical volume-weighted). */
export function computeVwap(
  candles: BotCandle[],
  sessionStartMs: number,
): number | null {
  let pv = 0;
  let vol = 0;
  for (const c of candles) {
    if (c.chartTime < sessionStartMs) continue;
    const typical = (c.high + c.low + c.close) / 3;
    const v = Math.max(0, c.volume);
    pv += typical * v;
    vol += v;
  }
  if (vol <= 0) return null;
  return pv / vol;
}

/** Wilder ATR(period) over the candle buffer. */
export function computeAtr(
  candles: BotCandle[],
  period: number,
): number | null {
  if (candles.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close),
    );
    trs.push(tr);
  }
  if (trs.length < period) return null;
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

/** Opening range high/low for 9:30–9:35 ET (5 one-minute bars). */
export function computeOrbRange(
  candles: BotCandle[],
  sessionStartMs: number,
): OrbRange | null {
  const endMs = sessionStartMs + 5 * 60 * 1000;
  const orbit = candles.filter(
    (c) => c.chartTime >= sessionStartMs && c.chartTime < endMs,
  );
  if (orbit.length < 3) return null;
  return {
    high: Math.max(...orbit.map((c) => c.high)),
    low: Math.min(...orbit.map((c) => c.low)),
  };
}

/**
 * VWAP pullback: price dips toward VWAP in an uptrend → CALL,
 * rallies toward VWAP in a downtrend → PUT.
 */
export function evaluateVwapPullback(
  candles: BotCandle[],
  vwap: number | null,
  atr: number | null,
): SignalDirection | null {
  if (vwap == null || atr == null || candles.length < 5) return null;
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const band = atr * 0.25;
  const nearVwap = Math.abs(last.close - vwap) <= band;
  if (!nearVwap) return null;

  const trendUp = last.close > vwap && prev.close <= vwap + band;
  const trendDown = last.close < vwap && prev.close >= vwap - band;
  if (trendUp && last.close >= prev.low) return 'CALL';
  if (trendDown && last.close <= prev.high) return 'PUT';
  return null;
}

/** ORB breakout: close above range high → CALL, below low → PUT. */
export function evaluateOrb5m(
  candles: BotCandle[],
  orb: OrbRange | null,
): SignalDirection | null {
  if (!orb || candles.length < 1) return null;
  const last = candles[candles.length - 1];
  if (last.close > orb.high) return 'CALL';
  if (last.close < orb.low) return 'PUT';
  return null;
}

export interface CombinedSignal {
  at: number;
  strategies: Array<'VWAP_PULLBACK' | 'ORB_5M'>;
  direction: SignalDirection;
  reason: string;
}

/**
 * CONFIRMING = AND: all enabled strategies that produce a signal must agree.
 * If an enabled strategy has no signal, the combo does not fire.
 */
export function combineSignals(
  enabled: Array<'VWAP_PULLBACK' | 'ORB_5M'>,
  results: Partial<Record<'VWAP_PULLBACK' | 'ORB_5M', SignalDirection | null>>,
  nowMs = Date.now(),
): CombinedSignal | null {
  if (!enabled.length) return null;
  const directions: SignalDirection[] = [];
  const strategies: Array<'VWAP_PULLBACK' | 'ORB_5M'> = [];
  for (const s of enabled) {
    const d = results[s] ?? null;
    if (!d) return null;
    directions.push(d);
    strategies.push(s);
  }
  const first = directions[0];
  if (!directions.every((d) => d === first)) return null;
  return {
    at: nowMs,
    strategies,
    direction: first,
    reason: `CONFIRMING ${strategies.join('+')} → ${first}`,
  };
}

/** Epoch ms for 9:30 America/New_York on the given calendar day (or today). */
export function etSessionStartMs(now: Date = new Date()): number {
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  // Probe offset like etDayBounds
  const noonProbe = new Date(`${dateKey}T12:00:00Z`);
  const offsetParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'shortOffset',
    hour: 'numeric',
  }).formatToParts(noonProbe);
  const tzName =
    offsetParts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-4';
  const match = tzName.match(/GMT([+-]\d+)/);
  const offsetHours = match ? Number(match[1]) : -4;
  const sign = offsetHours <= 0 ? '-' : '+';
  const offsetStr = `${sign}${String(Math.abs(offsetHours)).padStart(
    2,
    '0',
  )}:00`;
  return new Date(`${dateKey}T09:30:00${offsetStr}`).getTime();
}

/** Current HH:MM in America/New_York. */
export function etNowHhMm(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
}

export function isWithinWindow(
  nowHhMm: string,
  start: string,
  end: string,
): boolean {
  return nowHhMm >= start && nowHhMm < end;
}

export function isAtOrPast(nowHhMm: string, target: string): boolean {
  return nowHhMm >= target;
}
