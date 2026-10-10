import { BotStrategy } from './enums/strategy.enum';

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

/**
 * ORB breakout that fires once, on the bar that leaves the range.
 * The previous close must still be inside so a later bar outside the range
 * does not re-arm after every cooldown.
 */
export function evaluateOrb5mCrossover(
  candles: BotCandle[],
  orb: OrbRange | null,
): SignalDirection | null {
  if (!orb || candles.length < 2) return null;
  const prev = candles[candles.length - 2];
  const last = candles[candles.length - 1];
  const prevInside = prev.close <= orb.high && prev.close >= orb.low;
  if (!prevInside) return null;
  if (last.close > orb.high) return 'CALL';
  if (last.close < orb.low) return 'PUT';
  return null;
}

/** String-enum values are not assignable from their literals, so the public
 * signal API takes the value union. Enum members assign to it. */
export type BotStrategyId = `${BotStrategy}`;

export interface CombinedSignal {
  at: number;
  strategies: BotStrategyId[];
  direction: SignalDirection;
  reason: string;
}

/** `'ANY'` is 1, `'CONFIRMING'` is every enabled strategy, a number is a vote. */
export type SignalAgreement = number | 'CONFIRMING' | 'ANY';

function agreementFloor(
  agreement: SignalAgreement,
  enabledCount: number,
): number {
  if (agreement === 'CONFIRMING') return Math.max(enabledCount, 1);
  if (agreement === 'ANY') return 1;
  return Math.max(1, Math.floor(agreement));
}

/**
 * Combine enabled strategy outputs.
 * - agreement 1 / ANY: first enabled strategy with a signal fires; later
 *   signals that agree are attributed, later disagreements are ignored.
 * - agreement equal to the enabled count / CONFIRMING: every enabled
 *   strategy must signal and agree.
 * - anything between: that many must agree, and the other direction must not.
 */
export function combineSignals(
  enabled: readonly BotStrategyId[],
  results: Partial<Record<BotStrategyId, SignalDirection | null>>,
  nowMs = Date.now(),
  agreement: SignalAgreement = 'ANY',
): CombinedSignal | null {
  if (!enabled.length) return null;
  const min = agreementFloor(agreement, enabled.length);

  if (min <= 1) {
    const strategies: BotStrategyId[] = [];
    let direction: SignalDirection | null = null;
    for (const s of enabled) {
      const d = results[s] ?? null;
      if (!d) continue;
      if (!direction) {
        direction = d;
        strategies.push(s);
      } else if (d === direction) {
        strategies.push(s);
      }
    }
    if (!direction || !strategies.length) return null;
    return {
      at: nowMs,
      strategies,
      direction,
      reason: `ANY ${strategies.join('+')} → ${direction}`,
    };
  }

  const calls: BotStrategyId[] = [];
  const puts: BotStrategyId[] = [];
  for (const s of enabled) {
    const d = results[s] ?? null;
    if (d === 'CALL') calls.push(s);
    else if (d === 'PUT') puts.push(s);
  }
  const callWins = calls.length >= min && calls.length > puts.length;
  const putWins = puts.length >= min && puts.length > calls.length;
  if (!callWins && !putWins) return null;
  const strategies = callWins ? calls : puts;
  const direction: SignalDirection = callWins ? 'CALL' : 'PUT';
  const label = min >= enabled.length ? 'CONFIRMING' : `AGREE ${min}`;
  return {
    at: nowMs,
    strategies,
    direction,
    reason: `${label} ${strategies.join('+')} → ${direction}`,
  };
}

/** Exponential moving average of close. Null until `period` bars exist. */
export function computeEma(
  candles: BotCandle[],
  period: number,
): number | null {
  if (period < 1 || candles.length < period) return null;
  const k = 2 / (period + 1);
  let ema =
    candles.slice(0, period).reduce((sum, candle) => sum + candle.close, 0) /
    period;
  for (const candle of candles.slice(period)) {
    ema = candle.close * k + ema * (1 - k);
  }
  return ema;
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
  return etHhMmFromMs(now.getTime());
}

/** ET wall clock HH:MM for an epoch ms timestamp. */
export function etHhMmFromMs(at: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(at));
}

/** Fewer session minutes than this and session VWAP is not ready. */
export const SESSION_VWAP_MIN_MINUTES = 10;

/**
 * Session VWAP from 9:30 ET on. Index bars often have no volume, so those
 * fall back to the mean of typical prices (H+L+C)/3 — same rule as the trainer
 * trend gate.
 */
export function sessionVwapFromCandles(
  candles: BotCandle[],
  sessionStartMs: number,
): number | null {
  const fromSession = candles.filter((c) => c.chartTime >= sessionStartMs);
  if (fromSession.length < SESSION_VWAP_MIN_MINUTES) return null;
  const weighted = computeVwap(fromSession, sessionStartMs);
  if (weighted != null) return weighted;
  let sum = 0;
  for (const c of fromSession) {
    sum += (c.high + c.low + c.close) / 3;
  }
  return sum / fromSession.length;
}

/**
 * ET wall clock to the second. Sub-minute recording needs this: `etNowHhMm`
 * is still the right key for anything bucketed by minute, and lexical
 * comparison against an `HH:MM` bound would treat `16:00:30` as past `16:00`,
 * so the two are kept separate rather than one widened.
 */
export function etNowHhMmSs(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
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

export interface DirectionGateSettings {
  directionsEnabled: Array<'CALL' | 'PUT'>;
  canBuyCalls: boolean;
  canBuyPuts: boolean;
}

/**
 * Intersection of operator preference (`directionsEnabled`) and declared
 * account capability (`canBuyCalls`/`canBuyPuts`). Both must allow the
 * direction before the engine may enter.
 */
export function isDirectionAllowed(
  direction: SignalDirection,
  settings: DirectionGateSettings,
): boolean {
  if (!settings.directionsEnabled.includes(direction)) return false;
  return direction === 'CALL' ? settings.canBuyCalls : settings.canBuyPuts;
}
