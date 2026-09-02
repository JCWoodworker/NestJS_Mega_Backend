/**
 * Schwab Streamer LEVELONE_OPTIONS field map (see Schwab Trader API
 * Streamer Guide). Keys are sent to Schwab as a comma-separated string in
 * the SUBS request; values below document what each numeric key means so
 * consumers of `option-ticks` don't have to cross-reference the guide.
 */
export const LEVEL_ONE_OPTIONS_FIELDS = {
  SYMBOL: '0',
  BID_PRICE: '1',
  ASK_PRICE: '2',
  LAST_PRICE: '3',
  BID_SIZE: '4',
  ASK_SIZE: '8',
  TOTAL_VOLUME: '9',
  OPEN_INTEREST: '16',
  DELTA: '17',
} as const;

export const LEVEL_ONE_OPTIONS_FIELD_KEYS = Object.values(
  LEVEL_ONE_OPTIONS_FIELDS,
).join(',');

export const LEVEL_ONE_EQUITY_FIELDS = {
  SYMBOL: '0',
  BID_PRICE: '1',
  ASK_PRICE: '2',
  LAST_PRICE: '3',
} as const;

export const LEVEL_ONE_EQUITY_FIELD_KEYS = Object.values(
  LEVEL_ONE_EQUITY_FIELDS,
).join(',');
