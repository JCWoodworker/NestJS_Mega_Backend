/** UTF-8 BOM so Excel on Windows detects encoding. */
const CSV_BOM = '\uFEFF';

/**
 * RFC4180-ish CSV from an array of plain objects. Nested values are
 * JSON-stringified. Empty input still yields a headerless empty file so the
 * attachment list stays predictable for callers.
 */
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return CSV_BOM;

  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }

  const lines = [columns.map(escapeCsvField).join(',')];
  for (const row of rows) {
    lines.push(
      columns
        .map((col) => escapeCsvField(stringifyCsvValue(row[col])))
        .join(','),
    );
  }
  return CSV_BOM + lines.join('\r\n') + '\r\n';
}

export function entityToPlain(row: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'function') continue;
    out[key] = value;
  }
  return out;
}

function stringifyCsvValue(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export interface CsvAttachment {
  filename: string;
  content: Buffer;
}

export function csvAttachment(
  filename: string,
  rows: Record<string, unknown>[],
): CsvAttachment {
  return {
    filename,
    content: Buffer.from(rowsToCsv(rows), 'utf8'),
  };
}
