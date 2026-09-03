import { BadRequestException, ConflictException } from '@nestjs/common';

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
  };

  const service = new BotStateService(
    stateRepository as any,
    realizedRepository as any,
    httpService as any,
    ordersService as any,
    config as any,
    botEngine as any,
  );

  return { service, botEngine, getRowSnapshot: () => row };
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
});
