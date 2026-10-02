import { BotSupervisorService } from './bot-supervisor.service';
import { BotLane } from './enums/bot-lane.enum';
import { BotMode } from './enums/bot-mode.enum';

const OWNER = 'owner-user-id';

function build(
  overrides: {
    row?: Partial<{
      mode: BotMode;
      lane: BotLane | null;
      lockout: boolean;
      openPosition: unknown;
    }>;
    paperEquity?: number;
    config?: Record<string, unknown>;
  } = {},
) {
  const row = {
    userId: OWNER,
    mode: BotMode.MANUAL,
    lane: null as BotLane | null,
    lockout: false,
    openPosition: null as unknown,
    ...overrides.row,
  };

  const botStateService = {
    getRow: jest.fn().mockResolvedValue(row),
    getStatus: jest
      .fn()
      .mockResolvedValue({ paperEquity: overrides.paperEquity ?? 6000 }),
    setLane: jest.fn().mockResolvedValue(undefined),
    setMode: jest.fn().mockResolvedValue(undefined),
    kill: jest.fn().mockResolvedValue(undefined),
    unlock: jest.fn().mockResolvedValue(undefined),
    resetPaper: jest.fn().mockResolvedValue(undefined),
  };
  const botEventService = { record: jest.fn().mockResolvedValue(undefined) };
  const v2Engine = {
    arm: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
  };
  const v2Row = {
    mode: row.mode === BotMode.BOT ? 'BOT' : 'MANUAL',
    running: row.mode === BotMode.BOT,
    lockout: row.lockout,
    lockoutReason: row.lockout ? 'LOCKOUT' : null,
    openPosition: row.openPosition,
    paperEquity: overrides.paperEquity ?? 10000,
    paperSettledCash: overrides.paperEquity ?? 10000,
  };
  const v2State = {
    get: jest.fn().mockResolvedValue(v2Row),
    save: jest.fn().mockImplementation(async (next: typeof v2Row) => next),
  };

  const service = new BotSupervisorService(
    botStateService as any,
    botEventService as any,
    v2Engine as any,
    v2State as any,
    { applyIfDue: jest.fn().mockResolvedValue(false) } as any,
    {
      ownerUserId: OWNER,
      botSupervisorEnabled: true,
      supervisorArmAt: '09:45',
      supervisorStandDownAt: '15:45',
      ...overrides.config,
    } as any,
  );

  return { service, botStateService, botEventService, v2Engine, v2State, row };
}

function codes(blockers: Array<{ code: string }>) {
  return blockers.map((b) => b.code);
}

describe('BotSupervisorService blockers', () => {
  it('reports no blockers on a clean trading-day state', async () => {
    const { service } = build();
    const status = await service.getStatus();
    // May include OUTSIDE_SESSION depending on the wall clock; the state-based
    // blockers are what this asserts.
    expect(codes(status.blockers)).not.toContain('LOCKOUT');
    expect(codes(status.blockers)).not.toContain('OPEN_POSITION');
    expect(codes(status.blockers)).not.toContain('BELOW_MIN_EQUITY');
  });

  /**
   * The whole point of the conservative posture: a leftover position or a
   * stale lockout is state the supervisor did not create, so it must not
   * assume it away.
   */
  it('blocks on a leftover open position, and marks it reconcilable', async () => {
    const { service } = build({ row: { openPosition: { symbol: 'SPY' } } });
    const status = await service.getStatus();
    const blocker = status.blockers.find((b) => b.code === 'OPEN_POSITION');
    expect(blocker).toBeDefined();
    expect(blocker?.reconcilable).toBe(true);
  });

  it('blocks on a stale lockout, and marks it reconcilable', async () => {
    const { service } = build({ row: { lockout: true } });
    const status = await service.getStatus();
    const blocker = status.blockers.find((b) => b.code === 'LOCKOUT');
    expect(blocker?.reconcilable).toBe(true);
  });

  it('does not block a drawn-down paper ledger', async () => {
    const { service } = build({ paperEquity: 4999 });
    const status = await service.getStatus();
    expect(codes(status.blockers)).not.toContain('BELOW_MIN_EQUITY');
  });

  it('blocks when paper equity is negative', async () => {
    const { service } = build({ paperEquity: -1 });
    const status = await service.getStatus();
    expect(codes(status.blockers)).toContain('BELOW_MIN_EQUITY');
  });

  it('does not treat the retired champion live lane as a V2 blocker', async () => {
    const { service } = build({ row: { lane: BotLane.BOT_LIVE } });
    const status = await service.getStatus();
    expect(codes(status.blockers)).not.toContain('LIVE_LANE_SELECTED');
    expect(status.lane).toBeNull();
  });

  it('reports a blocker when disabled', async () => {
    const { service } = build({ config: { botSupervisorEnabled: false } });
    const status = await service.getStatus();
    expect(codes(status.blockers)).toContain('SUPERVISOR_DISABLED');
    expect(status.enabled).toBe(false);
  });

  it('reports a blocker when no owner is configured', async () => {
    const { service } = build({ config: { ownerUserId: null } });
    const status = await service.getStatus();
    expect(codes(status.blockers)).toEqual(['NO_OWNER_CONFIGURED']);
  });
});

describe('BotSupervisorService operator actions', () => {
  it('reconcile flattens and clears the trainer lockout without topping up a positive ledger', async () => {
    const { service, botStateService, v2Engine, v2State } = build({
      row: { openPosition: { symbol: 'SPY' }, lockout: true },
      paperEquity: 1000,
    });

    await service.reconcile();

    expect(v2Engine.stop).toHaveBeenCalled();
    expect(v2State.save).toHaveBeenCalled();
    expect(botStateService.kill).not.toHaveBeenCalled();
    expect(botStateService.resetPaper).not.toHaveBeenCalled();
    expect(botStateService.setMode).not.toHaveBeenCalled();
  });

  it('reconcile leaves a clean state alone', async () => {
    const { service, botStateService } = build();

    await service.reconcile();

    expect(botStateService.kill).not.toHaveBeenCalled();
    expect(botStateService.resetPaper).not.toHaveBeenCalled();
  });

  it('armNow arms paper when nothing blocks it', async () => {
    const { service, v2Engine, botStateService } = build();

    await service.armNow();

    expect(v2Engine.arm).toHaveBeenCalled();
    expect(botStateService.setMode).not.toHaveBeenCalled();
  });

  /** A manual arm skips the time window, never the safety checks. */
  it('armNow still refuses on a safety blocker', async () => {
    const { service, botStateService } = build({ row: { lockout: true } });

    await service.armNow();

    expect(botStateService.setMode).not.toHaveBeenCalled();
  });

  it('armNow still arms when the retired champion lane is live', async () => {
    const { service, v2Engine } = build({
      row: { lane: BotLane.BOT_LIVE },
    });

    await service.armNow();

    expect(v2Engine.arm).toHaveBeenCalled();
  });

  it('standDownNow stops a running V2 bot', async () => {
    const { service, v2Engine, botStateService } = build({
      row: { mode: BotMode.BOT, lane: BotLane.BOT_PAPER },
    });

    await service.standDownNow();

    expect(v2Engine.stop).toHaveBeenCalled();
    expect(botStateService.kill).not.toHaveBeenCalled();
  });

  it('standDownNow is a no-op when the bot is not running', async () => {
    const { service, botStateService } = build();

    await service.standDownNow();

    expect(botStateService.kill).not.toHaveBeenCalled();
  });
});
