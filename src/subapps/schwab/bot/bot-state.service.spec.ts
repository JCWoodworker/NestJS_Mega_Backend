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
    paperEquity: 1000,
    paperSettledCash: 1000,
    paperDayStartEquity: 1000,
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
    await service.enableLive(true);
    const status = await service.setLane(BotLane.BOT_LIVE, true);
    expect(status.lane).toBe(BotLane.BOT_LIVE);
  });

  it('enableLive rejects confirm !== true', async () => {
    const { service } = buildService();
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

  it('minEquityOk is false below the $100 floor for paper equity', async () => {
    const { service, getRowSnapshot } = buildService();
    await service.setLane(BotLane.BOT_PAPER);
    getRowSnapshot().paperEquity = 50;
    const status = await service.getStatus();
    expect(status.equity).toBe(50);
    expect(status.minEquityOk).toBe(false);
  });

  it('minEquityOk is true at/above the $100 floor', async () => {
    const { service, getRowSnapshot } = buildService();
    await service.setLane(BotLane.BOT_PAPER);
    getRowSnapshot().paperEquity = 1000;
    const status = await service.getStatus();
    expect(status.minEquityOk).toBe(true);
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
