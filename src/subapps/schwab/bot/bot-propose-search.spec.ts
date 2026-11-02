import { eachDateKey } from './bot-fixture-dates';
import {
  applySearchPatch,
  buildCandidates,
  clearsBar,
  firstHourRange,
  quietCutoff,
  repeatedDropRules,
  scoreTrades,
  shouldHaveBought,
  splitHoldout,
  summarizeReplay,
  type SearchCandidate,
  type TradeLite,
} from './bot-propose-search';
import { ProposeSettings } from './bot-propose.util';

const ladder: ProposeSettings = {
  lossCutPct: 12,
  protectArmPct: 8,
  protectFloorPct: 2,
  givebackPct: 6,
  tightFromPct: 20,
  tightGivebackPct: 4,
};

function trade(etDateKey: string, netPnl: number): TradeLite {
  return { etDateKey, netPnl, fees: 1.3 };
}

function candidate(
  partial: Partial<SearchCandidate> & Pick<SearchCandidate, 'id'>,
): SearchCandidate {
  return {
    kind: 'rule-off',
    label: partial.id,
    source: 'test',
    patch: {},
    ...partial,
  };
}

describe('fixture dates', () => {
  it('walks every calendar day in the range', () => {
    expect(eachDateKey('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });

  it('refuses a reversed range', () => {
    expect(() => eachDateKey('2026-11-02', '2026-10-30')).toThrow(/after/);
  });
});

describe('Saturday search scoring', () => {
  it('counts a green day only when the day net is above zero', () => {
    const score = scoreTrades([
      trade('2026-10-13', 10),
      trade('2026-10-13', -4),
      trade('2026-10-14', -1),
      trade('2026-10-15', 0),
    ]);
    expect(score.greenDays).toBe(1);
    expect(score.net).toBe(5);
    expect(score.trades).toBe(4);
  });

  it('holds out the last two sessions', () => {
    expect(splitHoldout(['a', 'b', 'c', 'd'])).toEqual({
      search: ['a', 'b'],
      holdout: ['c', 'd'],
    });
  });

  it('keeps a candidate only when the search net rises, green days do not fall, and the holdout is not worse', () => {
    const book = { trades: 4, net: -10, greenDays: 1, fees: 0 };
    const holdout = { trades: 1, net: -2, greenDays: 0, fees: 0 };
    expect(
      clearsBar(book, holdout, { ...book, net: -4 }, { ...holdout, net: -2 }),
    ).toBe(true);
    expect(
      clearsBar(book, holdout, { ...book, net: -4, greenDays: 0 }, holdout),
    ).toBe(false);
    expect(
      clearsBar(book, holdout, { ...book, net: -4 }, { ...holdout, net: -3 }),
    ).toBe(false);
    expect(clearsBar(book, holdout, book, holdout)).toBe(false);
  });

  it('names the rule that would have lost less on a red day', () => {
    const notes = shouldHaveBought({
      sessions: [{ etDateKey: '2026-10-14', window: 'search' }],
      bookTrades: [trade('2026-10-14', -20)],
      alone: [
        { rule: 'EMA_MOMENTUM', trades: [trade('2026-10-14', -5)] },
        { rule: 'VWAP_REVERSION', trades: [trade('2026-10-14', 8)] },
      ],
    });
    expect(notes).toEqual([
      {
        etDateKey: '2026-10-14',
        window: 'search',
        rule: 'VWAP_REVERSION',
        bookNet: -20,
        ruleNet: 8,
      },
    ]);
  });

  it('does not drop a rule after one red week', () => {
    expect(
      repeatedDropRules(
        [
          { rule: 'EMA_MOMENTUM', searchNet: -10 },
          { rule: 'VWAP_REVERSION', searchNet: 4 },
        ],
        null,
      ),
    ).toEqual([]);
  });

  it('drops a rule that is red for two Saturdays while another rule is green both weeks', () => {
    expect(
      repeatedDropRules(
        [
          { rule: 'EMA_MOMENTUM', searchNet: -10 },
          { rule: 'VWAP_REVERSION', searchNet: 4 },
        ],
        [
          { rule: 'EMA_MOMENTUM', searchNet: -3 },
          { rule: 'VWAP_REVERSION', searchNet: 2 },
        ],
      ),
    ).toEqual(['EMA_MOMENTUM']);
  });

  it('does not drop a red rule when nothing else is green', () => {
    expect(
      repeatedDropRules(
        [
          { rule: 'EMA_MOMENTUM', searchNet: -10 },
          { rule: 'VWAP_REVERSION', searchNet: -1 },
        ],
        [
          { rule: 'EMA_MOMENTUM', searchNet: -3 },
          { rule: 'VWAP_REVERSION', searchNet: -2 },
        ],
      ),
    ).toEqual([]);
  });

  it('sets the quiet cutoff at the top of the quietest third', () => {
    expect(quietCutoff([9, 1, 8, 2, 7, 3, 6, 4, 5])).toBe(3);
    expect(quietCutoff([1, 2])).toBeNull();
  });

  it('measures the first hour of spot, not the whole session', () => {
    const at = (hhmm: string) => Date.parse(`2026-10-30T${hhmm}:00-04:00`);
    expect(
      firstHourRange([
        { at: at('09:30'), spot: 5800 },
        { at: at('10:00'), spot: 5804 },
        { at: at('11:00'), spot: 5900 },
      ]),
    ).toBe(4);
  });

  it('picks the candidate that makes the most on the search window and still clears the holdout', () => {
    const keys = ['d1', 'd2', 'd3', 'd4'];
    const candidates = [
      candidate({ id: 'book', kind: 'book' }),
      candidate({
        id: 'off:RANGE_FADE',
        patch: { strategiesEnabled: ['EMA_MOMENTUM'] },
      }),
      candidate({
        id: 'window:11:00',
        kind: 'window',
        patch: { tradeWindowEnd: '11:00' },
      }),
    ];
    const tradesById = new Map<string, TradeLite[]>([
      [
        'book',
        [trade('d1', -10), trade('d2', 4), trade('d3', -3), trade('d4', 1)],
      ],
      [
        'off:RANGE_FADE',
        [trade('d1', -2), trade('d2', 4), trade('d3', -3), trade('d4', 1)],
      ],
      [
        'window:11:00',
        [trade('d1', 5), trade('d2', 4), trade('d3', -8), trade('d4', 1)],
      ],
    ]);
    const summary = summarizeReplay({
      sessionKeys: keys,
      candidates,
      tradesById,
      priorRules: null,
      quietCutoffPts: null,
    });
    expect(summary.winner?.id).toBe('off:RANGE_FADE');
    expect(summary.ran.find((row) => row.id === 'window:11:00')?.cleared).toBe(
      false,
    );
  });

  it('tries each rule alone, each rule off, earlier windows, and one ladder step', () => {
    const candidates = buildCandidates({
      rules: ['EMA_MOMENTUM', 'VWAP_REVERSION'],
      cooldownMins: 2,
      tradeWindowEnd: '14:45',
      ladder,
    });
    expect(candidates.some((row) => row.id === 'alone:EMA_MOMENTUM')).toBe(
      true,
    );
    expect(candidates.some((row) => row.id === 'off:VWAP_REVERSION')).toBe(
      true,
    );
    expect(candidates.some((row) => row.id === 'window:11:00')).toBe(true);
    expect(candidates.some((row) => row.id === 'quiet-days')).toBe(true);
    expect(
      candidates.some(
        (row) => row.kind === 'ladder' && row.patch.lossCutPct != null,
      ),
    ).toBe(true);
    const raised = buildCandidates({
      rules: ['EMA_MOMENTUM'],
      cooldownMins: 2,
      tradeWindowEnd: '14:45',
      ladder: { ...ladder, protectFloorPct: 7, protectArmPct: 8 },
    }).find((row) => (row.patch.protectFloorPct ?? 0) >= 8);
    expect(raised).toBeUndefined();
  });

  it('writes a rule change onto the trainer and the sell ladder onto both books', () => {
    const trainer = {
      strategiesEnabled: ['EMA_MOMENTUM', 'VWAP_REVERSION'],
      cooldownMins: 2,
      tradeWindowEnd: '14:45',
      lossCutPct: 12,
      protectArmPct: 8,
      protectFloorPct: 2,
      givebackPct: 6,
      tightFromPct: 20,
      tightGivebackPct: 4,
    };
    const personal = {
      lossCutPct: 12,
      protectArmPct: 8,
      protectFloorPct: 2,
      givebackPct: 6,
      tightFromPct: 20,
      tightGivebackPct: 4,
    };
    expect(
      applySearchPatch(trainer, personal, {
        strategiesEnabled: ['EMA_MOMENTUM'],
        lossCutPct: 10,
      }),
    ).toBe(true);
    expect(trainer.strategiesEnabled).toEqual(['EMA_MOMENTUM']);
    expect(trainer.lossCutPct).toBe(10);
    expect(personal.lossCutPct).toBe(10);
    expect(personal).not.toHaveProperty('strategiesEnabled');
  });
});
