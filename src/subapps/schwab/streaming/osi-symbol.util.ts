export type OptionRight = 'C' | 'P';

export interface BuildOsiSymbolParams {
  /** Underlying root, e.g. "SPY" or "SPXW". */
  root: string;
  /** Expiration date of the contract. */
  expiration: Date;
  right: OptionRight;
  /** Strike price in dollars, e.g. 772 or 772.5. */
  strike: number;
}

const ROOT_LENGTH = 6;
const STRIKE_DIGITS = 8;

/**
 * Builds the standard 21-character OCC/OSI option symbol Schwab's APIs
 * require, e.g. "SPY   260827C00772000" (root padded to 6 chars + YYMMDD +
 * C/P + strike * 1000 zero-padded to 8 digits).
 */
export function buildOsiSymbol({
  root,
  expiration,
  right,
  strike,
}: BuildOsiSymbolParams): string {
  const paddedRoot = root.toUpperCase().padEnd(ROOT_LENGTH, ' ');
  const dateSegment = formatExpirationDate(expiration);
  const strikeSegment = Math.round(strike * 1000)
    .toString()
    .padStart(STRIKE_DIGITS, '0');

  return `${paddedRoot}${dateSegment}${right}${strikeSegment}`;
}

export interface ParsedOsiSymbol {
  root: string;
  expiration: Date;
  right: OptionRight;
  strike: number;
}

/** Parses a 21-character OSI symbol back into its component parts. */
export function parseOsiSymbol(symbol: string): ParsedOsiSymbol {
  if (symbol.length !== 21) {
    throw new Error(
      `Invalid OSI symbol "${symbol}": expected 21 characters, got ${symbol.length}`,
    );
  }

  const root = symbol.slice(0, ROOT_LENGTH).trim();
  const yy = symbol.slice(6, 8);
  const mm = symbol.slice(8, 10);
  const dd = symbol.slice(10, 12);
  const right = symbol.slice(12, 13) as OptionRight;
  const strikeSegment = symbol.slice(13, 21);

  return {
    root,
    expiration: new Date(
      Date.UTC(2000 + Number(yy), Number(mm) - 1, Number(dd)),
    ),
    right,
    strike: Number(strikeSegment) / 1000,
  };
}

function formatExpirationDate(date: Date): string {
  const yy = String(date.getUTCFullYear() % 100).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}
