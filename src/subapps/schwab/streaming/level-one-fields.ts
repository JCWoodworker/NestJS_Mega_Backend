/**
 * Schwab Streamer LEVELONE_OPTIONS field map (see Schwab Trader API
 * Streamer Guide, "LEVELONE_OPTIONS Response Field Definitions"). Keys are
 * sent to Schwab as a comma-separated string in the SUBS request; values
 * below document what each numeric key means so consumers of `option-ticks`
 * don't have to cross-reference the guide.
 *
 * IMPORTANT: unlike LEVELONE_EQUITIES, options have a "Description" field at
 * index 1, which shifts every price/size field up by one relative to
 * equities (bid=2, not 1; ask=3, not 2; last=4, not 3; etc). A previous
 * version of this map copied the equities numbering directly onto options -
 * see the "option-ticks field mislabeling" changelog entry in
 * schwab-frontend-notes.md for the full story (this is what caused the
 * options chain to render as all `--`, since the frontend was reading bid
 * from a field that's virtually never present in a "Change"-type delta
 * update). Verified against real preprod tick data: field 8 was observed
 * monotonically increasing (consistent with Total Volume) and fields 16/17
 * fluctuated in the low hundreds (consistent with Bid/Ask Size in
 * contracts, not the near-static Open Interest or single-digit-decimal
 * Delta the old map claimed).
 */
export const LEVEL_ONE_OPTIONS_FIELDS = {
  SYMBOL: '0',
  BID_PRICE: '2',
  ASK_PRICE: '3',
  LAST_PRICE: '4',
  TOTAL_VOLUME: '8',
  OPEN_INTEREST: '9',
  BID_SIZE: '16',
  ASK_SIZE: '17',
  DELTA: '28',
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
