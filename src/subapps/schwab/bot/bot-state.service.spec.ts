import { BadRequestException, ConflictException } from '@nestjs/common';

import { etDateKey } from '@schwab/pnl/et-date.util';

import { BotStateService } from './bot-state.service';
import { BotLane } from './enums/bot-lane.enum';
import { BotMode } from './enums/bot-mode.enum';
import { KillScope } from './enums/kill-scope.enum';

function buildService() {
  let row: any = {
    id: '1',
    mode: BotMode.MANUAL,
    lane: null,
    running: false,
    lockout: false,
    lockoutReason: null,
    liveArmed: false,
    paperEquity: 6000,
    paperSettledCash: 6000,
    paperDayStartEquity: 6000,
    openPosition: null,
    lastSignal: null,
    lastError: null,
    updatedAt: new Date(),
  };

  const stateRepository = {
    find: jest.fn().mockImplementation(async () => (row ? [row] : [])),
    save: jest.fn().mockImplementation(async (patch: any) => {
      row = { ...row, ...patch };
      return row;
    }),
    create: jest.fn().mockImplementation((partial: any) => partial),
  };

  const realizedRepository = {
    find: jest.fn().mockResolvedValue([]),
  };

  const httpService = { get: jest.fn() };
  const ordersService = {
    listAccounts: jest.fn().mockResolvedValue([{ hashValue: 'HASH1' }]),
  };
  const config = { accountHash: 'HASH1' };
  const botEngine = {
    flattenAndHalt: jest.fn().mockResolvedValue(undefined),
    onControlPlaneChange: jest.fn(),
    getTransientPhase: jest.fn().mockReturnValue(null),
    getLastPremiumBidAt: jest.fn().mockReturnValue(null),
  };
  const botSettingsService = {
    getSettings: jest.fn().mockResolvedValue({
      tradeWindowStart: '10:00',
      tradeWindowEnd: '15:00',
      cooldownMins: 30,
    }),
  };
  const botEventService = {
    recent: jest.fn().mockResolvedValue([]),
    record: jest.fn().mockResolvedValue(undefined),
  };

  const service = new BotStateService(
    stateRepository as any,
    realizedRepository as any,
    httpService as any,
    ordersService as any,
    config as any,
    botEngine as any,
    botSettingsService as any,
    botEventService as any,
  );

  return { service, botEngine, botEventService, getRowSnapshot: () => row };
}

describe('BotStateService invariants', () => {
  it('setMode(BOT) with no lane parks (running stays false)', async () => {
    const { service } = buildService();
    const status = await service.setMode(BotMode.BOT);
    expect(status.mode).toBe(BotMode.BOT);
    expect(status.running).toBe(false);
  });

  it('rejects BOT_LIVE lane without confirmLive (acceptance #2)', async () => {
    const { service } = buildService();
    await expect(service.setLane(BotLane.BOT_LIVE)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.setLane(BotLane.BOT_LIVE, false as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects BOT_LIVE lane when live has not been armed', async () => {
    const { service } = buildService();
    await expect(service.setLane(BotLane.BOT_LIVE, true)).rejects.toThrow(
      'live to be armed',
    );
  });

  it('allows BOT_LIVE lane once armed + confirmed', async () => {
    const { service } = buildService();
    service.updateLiveBalances(5000, 5000, 5000);
    await service.enableLive(true);
    const status = await service.setLane(BotLane.BOT_LIVE, true);
    expect(status.lane).toBe(BotLane.BOT_LIVE);
  });

  it('enableLive rejects when live equity is below $5,000', async () => {
    const { service } = buildService();
    service.updateLiveBalances(4999.99, 4999.99, 4999.99);
    await expect(service.enableLive(true)).rejects.toThrow(BadRequestException);
    await expect(service.enableLive(true)).rejects.toThrow(/\$5,000/);
  });

  it('enableLive succeeds when live equity is at/above $5,000', async () => {
    const { service } = buildService();
    service.updateLiveBalances(5000, 5000, 5000);
    const status = await service.enableLive(true);
    expect(status.liveArmed).toBe(true);
  });

  it('rejects BOT_LIVE lane when live equity drops below $5,000 after arming', async () => {
    const { service } = buildService();
    service.updateLiveBalances(6000, 6000, 6000);
    await service.enableLive(true);
    service.updateLiveBalances(1000, 1000, 1000);
    await expect(service.setLane(BotLane.BOT_LIVE, true)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.setLane(BotLane.BOT_LIVE, true)).rejects.toThrow(
      /\$5,000/,
    );
  });

  it('enableLive rejects confirm !== true', async () => {
    const { service } = buildService();
    service.updateLiveBalances(5000, 5000, 5000);
    await expect(service.enableLive(false as any)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('allows BOT_PAPER lane without confirmLive or live arming', async () => {
    const { service } = buildService();
    const status = await service.setLane(BotLane.BOT_PAPER);
    expect(status.lane).toBe(BotLane.BOT_PAPER);
  });

  it('rejects switching lanes while a bot position is open', async () => {
    const { service, getRowSnapshot } = buildService();
    await service.setLane(BotLane.BOT_PAPER);
    const row = getRowSnapshot();
    row.openPosition = { symbol: 'X', quantity: 1, entryPrice: 1 };

    service.updateLiveBalances(5000, 5000, 5000);
    await service.enableLive(true);
    await expect(service.setLane(BotLane.BOT_LIVE, true)).rejects.toThrow(
      ConflictException,
    );
  });

  it('kill delegates to BotEngineService.flattenAndHalt (acceptance #3)', async () => {
    const { service, botEngine } = buildService();
    await service.kill(KillScope.ALL);
    expect(botEngine.flattenAndHalt).toHaveBeenCalledWith(
      'KILL_SWITCH',
      KillScope.ALL,
    );
  });

  it('disableLive flattens+halts LIVE scope only when lane is BOT_LIVE, and clears armed flag', async () => {
    const { service, botEngine, getRowSnapshot } = buildService();
    service.updateLiveBalances(5000, 5000, 5000);
    await service.enableLive(true);
    await service.setLane(BotLane.BOT_LIVE, true);

    await service.disableLive();
    expect(botEngine.flattenAndHalt).toHaveBeenCalledWith(
      'LIVE_DISABLED',
      KillScope.LIVE,
    );
    const row = getRowSnapshot();
    expect(row.liveArmed).toBe(false);
    expect(row.lane).toBeNull();
  });

  it('disableLive is a no-op flatten call when lane is not BOT_LIVE', async () => {
    const { service, botEngine } = buildService();
    await service.setLane(BotLane.BOT_PAPER);
    await service.disableLive();
    expect(botEngine.flattenAndHalt).not.toHaveBeenCalled();
  });

  it('minEquityOk is false below the $5,000 floor for paper equity', async () => {
    const { service, getRowSnapshot } = buildService();
    await service.setLane(BotLane.BOT_PAPER);
    getRowSnapshot().paperEquity = 4999;
    const status = await service.getStatus();
    expect(status.equity).toBe(4999);
    expect(status.minEquityOk).toBe(false);
    expect(status.minEquityThreshold).toBe(5000);
  });

  it('minEquityOk is true at/above the $5,000 floor for paper', async () => {
    const { service, getRowSnapshot } = buildService();
    await service.setLane(BotLane.BOT_PAPER);
    getRowSnapshot().paperEquity = 6000;
    const status = await service.getStatus();
    expect(status.minEquityOk).toBe(true);
    expect(status.minEquityThreshold).toBe(5000);
  });

  it('dayStartEquity follows the active lane (paper ledger vs live balances)', async () => {
    const { service, getRowSnapshot } = buildService();
    await service.setLane(BotLane.BOT_PAPER);
    getRowSnapshot().paperDayStartEquity = 5800;
    expect((await service.getStatus()).dayStartEquity).toBe(5800);

    service.updateLiveBalances(9000, 9000, 8500);
    await service.enableLive(true);
    await service.setLane(BotLane.BOT_LIVE, true);
    expect((await service.getStatus()).dayStartEquity).toBe(8500);
  });

  it('cooldownUntil is the lastTradeAt + cooldownMins instant, null once elapsed', async () => {
    const { service, getRowSnapshot } = buildService();
    await service.setLane(BotLane.BOT_PAPER);
    const lastTradeAt = new Date();
    getRowSnapshot().lastTradeAt = lastTradeAt;

    // botSettingsService mock reports cooldownMins: 30.
    const status = await service.getStatus();
    expect(status.cooldownUntil).toBe(lastTradeAt.getTime() + 30 * 60_000);

    getRowSnapshot().lastTradeAt = new Date(Date.now() - 31 * 60_000);
    expect((await service.getStatus()).cooldownUntil).toBeNull();
  });

  it('premiumWatchOk is false when a premium stop is armed but no bid is reaching the engine', async () => {
    const { service, getRowSnapshot, botEngine } = buildService();
    await service.setLane(BotLane.BOT_PAPER);

    // Flat: nothing to watch.
    expect((await service.getStatus()).premiumWatchOk).toBe(true);

    getRowSnapshot().openPosition = {
      symbol: 'SPY   260903C00770000',
      quantity: 1,
      entryPrice: 1,
      stopUnderlying: null,
      targetUnderlying: null,
      stopPremium: 0.75,
      targetPremium: 1.4,
      source: BotLane.BOT_PAPER,
    };
    expect((await service.getStatus()).premiumWatchOk).toBe(false);

    botEngine.getLastPremiumBidAt.mockReturnValue(Date.now());
    expect((await service.getStatus()).premiumWatchOk).toBe(true);
  });

  it('premiumWatchOk stays true when only underlying levels are armed', async () => {
    const { service, getRowSnapshot } = buildService();
    await service.setLane(BotLane.BOT_PAPER);
    getRowSnapshot().openPosition = {
      symbol: 'SPY   260903C00770000',
      quantity: 1,
      entryPrice: 1,
      stopUnderlying: 760,
      targetUnderlying: 765,
      stopPremium: null,
      targetPremium: null,
      source: BotLane.BOT_PAPER,
    };
    expect((await service.getStatus()).premiumWatchOk).toBe(true);
  });

  it('rejects BOT_PAPER lane when paper equity is below $5,000', async () => {
    const { service, getRowSnapshot } = buildService();
    getRowSnapshot().paperEquity = 1000;
    await expect(service.setLane(BotLane.BOT_PAPER)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('resetPaper sets equity/settled/day-start and refuses under the floor', async () => {
    const { service, getRowSnapshot } = buildService();
    getRowSnapshot().paperEquity = 99996;
    getRowSnapshot().paperSettledCash = 99996;
    const status = await service.resetPaper(6000);
    expect(status.paperEquity).toBe(6000);
    expect(status.paperSettledCash).toBe(6000);
    expect(getRowSnapshot().paperSettledCash).toBe(6000);
    expect(getRowSnapshot().paperDayStartEquity).toBe(6000);
    await expect(service.resetPaper(100)).rejects.toThrow(BadRequestException);
  });

  it('resetPaper refuses while a BOT_PAPER position is open', async () => {
    const { service, getRowSnapshot } = buildService();
    getRowSnapshot().openPosition = {
      symbol: 'X',
      quantity: 1,
      entryPrice: 1,
      source: BotLane.BOT_PAPER,
    };
    await expect(service.resetPaper(6000)).rejects.toThrow(ConflictException);
  });

  it('minEquityThreshold is $5,000 for BOT_LIVE and gates minEquityOk accordingly', async () => {
    const { service } = buildService();
    service.updateLiveBalances(4500, 4500, 4500);
    await expect(service.enableLive(true)).rejects.toThrow(BadRequestException);

    service.updateLiveBalances(5500, 5500, 5500);
    await service.enableLive(true);
    const status = await service.setLane(BotLane.BOT_LIVE, true);
    expect(status.minEquityThreshold).toBe(5000);
    expect(status.minEquityOk).toBe(true);

    service.updateLiveBalances(4000, 4000, 4000);
    const below = await service.getStatus();
    expect(below.minEquityThreshold).toBe(5000);
    expect(below.minEquityOk).toBe(false);
  });

  it('phase is STOPPED in MANUAL mode / with no lane', async () => {
    const { service } = buildService();
    const status = await service.getStatus();
    expect(status.phase).toBe('STOPPED');
  });

  it('phase is LOCKOUT once locked out, regardless of mode/lane', async () => {
    const { service, getRowSnapshot } = buildService();
    await service.setLane(BotLane.BOT_PAPER);
    await service.setMode(BotMode.BOT);
    getRowSnapshot().lockout = true;
    const status = await service.getStatus();
    expect(status.phase).toBe('LOCKOUT');
  });

  it('clearLockoutIfNewDay is a no-op when not locked out', async () => {
    const { service } = buildService();
    expect(await service.clearLockoutIfNewDay()).toBe(false);
  });

  it('clearLockoutIfNewDay clears a stale lockout from a prior day and emits UNLOCK', async () => {
    const { service, getRowSnapshot, botEventService } = buildService();
    const row = getRowSnapshot();
    row.lockout = true;
    row.lockoutReason = 'MAX_LOSS_USD';
    row.lockoutDateKey = '2000-01-01'; // long-past ET day

    const cleared = await service.clearLockoutIfNewDay();
    expect(cleared).toBe(true);
    expect(getRowSnapshot().lockout).toBe(false);
    expect(getRowSnapshot().lockoutReason).toBeNull();
    expect(botEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'UNLOCK' }),
    );
  });

  it('clearLockoutIfNewDay leaves a same-day lockout alone', async () => {
    const { service, getRowSnapshot } = buildService();
    const row = getRowSnapshot();
    row.lockout = true;
    row.lockoutDateKey = etDateKey();

    const cleared = await service.clearLockoutIfNewDay();
    expect(cleared).toBe(false);
    expect(getRowSnapshot().lockout).toBe(true);
  });

  describe('unlock (operator recovery from KILL_SWITCH — POST /bot/unlock)', () => {
    it('is a no-op when not locked out', async () => {
      const { service, botEventService } = buildService();
      const status = await service.unlock();
      expect(status.lockout).toBe(false);
      expect(botEventService.record).not.toHaveBeenCalled();
    });

    it('clears a same-day KILL_SWITCH lockout, re-arms running, and emits OPERATOR_UNLOCK', async () => {
      const { service, getRowSnapshot, botEngine, botEventService } =
        buildService();
      await service.setLane(BotLane.BOT_PAPER);
      await service.setMode(BotMode.BOT);
      const row = getRowSnapshot();
      row.lockout = true;
      row.lockoutReason = 'KILL_SWITCH';
      row.lockoutDateKey = etDateKey();
      row.running = false;

      const status = await service.unlock();
      expect(status.lockout).toBe(false);
      expect(status.lockoutReason).toBeNull();
      expect(getRowSnapshot().running).toBe(true);
      expect(botEventService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'UNLOCK',
          reason: 'OPERATOR_UNLOCK',
        }),
      );
      expect(botEngine.onControlPlaneChange).toHaveBeenCalled();
    });

    it('clears LIVE_DISABLED / HARD_FLATTEN_EOD / SOCKET_LOSS the same session too', async () => {
      for (const reason of [
        'LIVE_DISABLED',
        'HARD_FLATTEN_EOD',
        'SOCKET_LOSS',
      ]) {
        const { service, getRowSnapshot } = buildService();
        const row = getRowSnapshot();
        row.lockout = true;
        row.lockoutReason = reason;

        const status = await service.unlock();
        expect(status.lockout).toBe(false);
        expect(getRowSnapshot().lockoutReason).toBeNull();
      }
    });

    it('rejects unlocking a risk-limit halt (e.g. MAX_LOSS_USD) — needs a product decision', async () => {
      const { service, getRowSnapshot } = buildService();
      const row = getRowSnapshot();
      row.lockout = true;
      row.lockoutReason = 'MAX_LOSS_USD';

      await expect(service.unlock()).rejects.toThrow(ConflictException);
      expect(getRowSnapshot().lockout).toBe(true);
    });

    it('rejects unlocking a RECON_MISMATCH halt', async () => {
      const { service, getRowSnapshot } = buildService();
      const row = getRowSnapshot();
      row.lockout = true;
      row.lockoutReason = 'RECON_MISMATCH';

      await expect(service.unlock()).rejects.toThrow(ConflictException);
    });

    it('rejects unlocking a profit-target halt', async () => {
      const { service, getRowSnapshot } = buildService();
      const row = getRowSnapshot();
      row.lockout = true;
      row.lockoutReason = 'PROFIT_TARGET_USD';

      await expect(service.unlock()).rejects.toThrow(ConflictException);
    });

    it('does not resume running when mode is MANUAL or no lane is set', async () => {
      const { service, getRowSnapshot } = buildService();
      const row = getRowSnapshot();
      row.lockout = true;
      row.lockoutReason = 'KILL_SWITCH';
      row.mode = BotMode.MANUAL;
      row.lane = null;

      await service.unlock();
      expect(getRowSnapshot().running).toBe(false);
    });
  });
});
