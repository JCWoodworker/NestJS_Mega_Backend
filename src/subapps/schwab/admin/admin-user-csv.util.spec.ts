import { rowsToCsv } from './admin-user-csv.util';

describe('rowsToCsv', () => {
  it('emits a BOM and escapes commas/quotes', () => {
    const csv = rowsToCsv([
      { a: 'hello', b: 'x,y' },
      { a: 'say "hi"', b: 2 },
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('a,b');
    expect(csv).toContain('"x,y"');
    expect(csv).toContain('"say ""hi"""');
  });
});
