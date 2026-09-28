import { AnalyzedTrade, ExitPolicy } from './bot-analysis.util';
import {
  bootstrapLowerBound,
  buildEvidencePacket,
  capSettingsPatch,
  countStableSessions,
  strategyTrades,
} from './bot-propose.util';

function trade(partial: Partial<AnalyzedTrade>): AnalyzedTrade {
  return {
    tradeKey: 'k',
    etDateKey: '2026-09-21',
    lane: 'BOT_PAPER',
    direction: 'CALL',
    quantity: 1,
    entryPrice: 1,
    exitPrice: 1,
    openedAt: 0,
    closedAt: 1,
    holdMs: 1,
    grossPnl: 0,
    fees: 0,
    netPnl: -10,
    mfePremium: null,
    maePremium: null,
    timeToMfeMs: null,
    captureEfficiency: null,
    sampleCount: 0,
    exitReason: 'PREMIUM_STOP',
    strategies: null,
    ...partial,
  };
}

const policy: ExitPolicy = {
  stopPct: 0.3,
  targetPct: 0.5,
  timeStopMs: null,
  trailPct: null,
  trailArmPct: null,
};

describe('bot propose gates', () => {
  it('drops SOCKET_LOSS from the strategy sample', () => {
    const trades = strategyTrades([
      trade({ exitReason: 'SOCKET_LOSS', netPnl: -43 }),
      trade({ tradeKey: 'keep' }),
    ]);
    expect(trades.map((row) => row.tradeKey)).toEqual(['keep']);
  });

  it('puts the 5th percentile below a mixed sample mean', () => {
    const lower = bootstrapLowerBound([10, 10, 10, -5], 200, 7);
    expect(lower).not.toBeNull();
    expect(lower as number).toBeLessThan(10);
  });

  it('caps a settings step at 20 percent and two keys', () => {
    const patch = capSettingsPatch(
      {
        premiumTargetPct: 22,
        premiumStopPct: 25,
        trailPct: 15,
        trailArmPct: 20,
      },
      { premiumTargetPct: 80, premiumStopPct: 10, trailPct: 40 },
    );
    expect(Object.keys(patch).length).toBeLessThanOrEqual(2);
    expect(patch.premiumTargetPct).toBeCloseTo(26.4, 1);
  });

  it('counts the most common winning signature', () => {
    expect(countStableSessions(['a', 'a', 'a', 'b', null])).toBe(3);
  });

  it('does not call a red week actionable when the tape cannot be replayed', () => {
    const trades = ['2026-09-21', '2026-09-22', '2026-09-23'].flatMap(
      (etDateKey, day) =>
        Array.from({ length: 12 }, (_, index) =>
          trade({
            tradeKey: `${etDateKey}-${index}`,
            etDateKey,
            netPnl: -20,
          }),
        ),
    );
    const packet = buildEvidencePacket({
      trades,
      tapeByTradeKey: new Map(),
      policies: [policy],
      current: {
        premiumTargetPct: 22,
        premiumStopPct: 25,
        trailPct: 15,
        trailArmPct: 20,
      },
      weekEndingEt: '2026-09-23',
    });
    expect(packet.strategyTradeCount).toBe(36);
    expect(packet.actionable).toBe(false);
    expect(packet.blockedReasons).toContain('NO_TRAIN_IMPROVEMENT');
  });
});
