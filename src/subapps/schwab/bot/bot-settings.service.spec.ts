import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { BotSettingsService } from './bot-settings.service';
import { UpdateBotSettingsDto } from './dto/update-bot-settings.dto';
import {
  BotCombineMode,
  BotDirection,
  BotStrategy,
} from './enums/strategy.enum';

function buildService() {
  let row: any = {
    id: '1',
    vwapPullbackEnabled: true,
    orb5mEnabled: true,
    callsEnabled: true,
    putsEnabled: false,
    canBuyCalls: true,
    canBuyPuts: false,
    combineMode: BotCombineMode.CONFIRMING,
    riskPct: 10,
    useMaxLossUsd: false,
    maxLossUsd: null,
    useMaxLossPct: false,
    maxLossPct: null,
    useProfitUsd: false,
    profitUsd: null,
    useProfitPctDayStart: false,
    profitPctDayStart: null,
    useProfitPctCurrent: false,
    profitPctCurrent: null,
    minPremium: 0.6,
    maxPremium: 2.5,
    maxSpreadPct: 5,
    deltaMin: 0.4,
    deltaMax: 0.6,
    tradeWindowStart: '10:00',
    tradeWindowEnd: '15:00',
    hardFlattenTime: '15:30',
    cooldownMins: 30,
    atrPeriod: 14,
    paperSlippageCents: 1,
    updatedAt: new Date(),
  };

  const settingsRepository = {
    find: jest.fn().mockImplementation(async () => (row ? [row] : [])),
    save: jest.fn().mockImplementation(async (patch: any) => {
      row = { ...row, ...patch };
      return row;
    }),
    create: jest.fn().mockImplementation((partial: any) => partial),
  };

  const botEventService = {
    record: jest.fn().mockResolvedValue(undefined),
  };

  const service = new BotSettingsService(
    settingsRepository as any,
    botEventService as any,
  );
  return { service, getRowSnapshot: () => row, botEventService };
}

describe('BotSettingsService — strategiesEnabled / combineMode (contract §14b)', () => {
  it('GET view derives strategiesEnabled from the two boolean flags', async () => {
    const { service } = buildService();
    const settings = await service.getSettings();
    expect(settings.strategiesEnabled).toEqual([
      BotStrategy.VWAP_PULLBACK,
      BotStrategy.ORB_5M,
    ]);
    expect(settings.combineMode).toBe(BotCombineMode.CONFIRMING);
  });

  it('PUT with strategiesEnabled=[ORB_5M] disables VWAP_PULLBACK and keeps ORB_5M', async () => {
    const { service, getRowSnapshot } = buildService();
    const view = await service.updateSettings({
      strategiesEnabled: [BotStrategy.ORB_5M],
    });
    expect(view.strategiesEnabled).toEqual([BotStrategy.ORB_5M]);
    expect(getRowSnapshot().vwapPullbackEnabled).toBe(false);
    expect(getRowSnapshot().orb5mEnabled).toBe(true);
  });

  it('PUT with strategiesEnabled=[VWAP_PULLBACK] disables ORB_5M and keeps VWAP_PULLBACK', async () => {
    const { service, getRowSnapshot } = buildService();
    const view = await service.updateSettings({
      strategiesEnabled: [BotStrategy.VWAP_PULLBACK],
    });
    expect(view.strategiesEnabled).toEqual([BotStrategy.VWAP_PULLBACK]);
    expect(getRowSnapshot().vwapPullbackEnabled).toBe(true);
    expect(getRowSnapshot().orb5mEnabled).toBe(false);
  });

  it('PUT without strategiesEnabled leaves the existing flags untouched', async () => {
    const { service, getRowSnapshot } = buildService();
    await service.updateSettings({ riskPct: 25 });
    expect(getRowSnapshot().vwapPullbackEnabled).toBe(true);
    expect(getRowSnapshot().orb5mEnabled).toBe(true);
    expect(getRowSnapshot().riskPct).toBe(25);
  });

  it('PUT accepts combineMode alongside other fields and persists it', async () => {
    const { service, getRowSnapshot } = buildService();
    const view = await service.updateSettings({
      combineMode: BotCombineMode.CONFIRMING,
      riskPct: 15,
    });
    expect(view.combineMode).toBe(BotCombineMode.CONFIRMING);
    expect(getRowSnapshot().riskPct).toBe(15);
  });
});

describe('BotSettingsService — directionsEnabled / canBuy* (contract §14b)', () => {
  it('GET view defaults to CALL-only preference and calls-only capability', async () => {
    const { service } = buildService();
    const settings = await service.getSettings();
    expect(settings.directionsEnabled).toEqual([BotDirection.CALL]);
    expect(settings.canBuyCalls).toBe(true);
    expect(settings.canBuyPuts).toBe(false);
  });

  it('PUT with directionsEnabled=[CALL,PUT] enables both preference flags', async () => {
    const { service, getRowSnapshot } = buildService();
    const view = await service.updateSettings({
      directionsEnabled: [BotDirection.CALL, BotDirection.PUT],
    });
    expect(view.directionsEnabled).toEqual([
      BotDirection.CALL,
      BotDirection.PUT,
    ]);
    expect(getRowSnapshot().callsEnabled).toBe(true);
    expect(getRowSnapshot().putsEnabled).toBe(true);
  });

  it('PUT with directionsEnabled=[PUT] disables calls preference', async () => {
    const { service, getRowSnapshot } = buildService();
    const view = await service.updateSettings({
      directionsEnabled: [BotDirection.PUT],
    });
    expect(view.directionsEnabled).toEqual([BotDirection.PUT]);
    expect(getRowSnapshot().callsEnabled).toBe(false);
    expect(getRowSnapshot().putsEnabled).toBe(true);
  });

  it('PUT without directionsEnabled leaves preference flags untouched', async () => {
    const { service, getRowSnapshot } = buildService();
    await service.updateSettings({ riskPct: 25 });
    expect(getRowSnapshot().callsEnabled).toBe(true);
    expect(getRowSnapshot().putsEnabled).toBe(false);
  });

  it('PUT can flip canBuyPuts capability independently of preference', async () => {
    const { service, getRowSnapshot } = buildService();
    const view = await service.updateSettings({ canBuyPuts: true });
    expect(view.canBuyPuts).toBe(true);
    expect(getRowSnapshot().canBuyPuts).toBe(true);
    expect(view.directionsEnabled).toEqual([BotDirection.CALL]);
  });

  it('emits OPERATOR_SETTINGS with before/after on update', async () => {
    const { service, botEventService } = buildService();
    await service.updateSettings({ riskPct: 25 });
    expect(botEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'OPERATOR_SETTINGS',
        reason: 'SETTINGS_UPDATED',
        payload: expect.objectContaining({
          before: expect.objectContaining({ riskPct: 10 }),
          after: expect.objectContaining({ riskPct: 25 }),
        }),
      }),
    );
  });
});

describe('UpdateBotSettingsDto validation (contract §14b)', () => {
  async function validateBody(body: Record<string, unknown>) {
    const dto = plainToInstance(UpdateBotSettingsDto, body);
    return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  }

  it('accepts the full contract patch (strategiesEnabled + combineMode) with no errors', async () => {
    const errors = await validateBody({
      strategiesEnabled: ['VWAP_PULLBACK', 'ORB_5M'],
      combineMode: 'CONFIRMING',
      riskPct: 12,
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts a single-strategy patch', async () => {
    const errors = await validateBody({ strategiesEnabled: ['ORB_5M'] });
    expect(errors).toHaveLength(0);
  });

  it('rejects an empty strategiesEnabled array', async () => {
    const errors = await validateBody({ strategiesEnabled: [] });
    expect(errors.some((e) => e.property === 'strategiesEnabled')).toBe(true);
  });

  it('rejects an unknown strategy key', async () => {
    const errors = await validateBody({ strategiesEnabled: ['NOT_REAL'] });
    expect(errors.some((e) => e.property === 'strategiesEnabled')).toBe(true);
  });

  it('rejects a combineMode value other than CONFIRMING', async () => {
    const errors = await validateBody({ combineMode: 'OR' });
    expect(errors.some((e) => e.property === 'combineMode')).toBe(true);
  });

  it('other already-accepted fields still validate unchanged', async () => {
    const errors = await validateBody({
      riskPct: 50,
      tradeWindowStart: '09:30',
      cooldownMins: 15,
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts directionsEnabled + canBuyCalls/canBuyPuts', async () => {
    const errors = await validateBody({
      directionsEnabled: ['CALL', 'PUT'],
      canBuyCalls: true,
      canBuyPuts: true,
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects an empty directionsEnabled array', async () => {
    const errors = await validateBody({ directionsEnabled: [] });
    expect(errors.some((e) => e.property === 'directionsEnabled')).toBe(true);
  });

  it('rejects an unknown direction key', async () => {
    const errors = await validateBody({ directionsEnabled: ['BOTH'] });
    expect(errors.some((e) => e.property === 'directionsEnabled')).toBe(true);
  });

  it('accepts profitTarget* aliases alongside canonical profit* fields', async () => {
    const errors = await validateBody({
      profitTargetUsd: 50,
      profitTargetPctDayStart: 10,
      profitTargetPctCurrent: null,
      profitUsd: null,
      profitPctDayStart: null,
      profitPctCurrent: null,
      useProfitUsd: false,
    });
    expect(errors).toHaveLength(0);
  });
});

describe('BotSettingsService — profitTarget* aliases', () => {
  it('maps profitTargetUsd onto profitUsd when both are sent (alias wins)', async () => {
    const { service, getRowSnapshot } = buildService();
    const view = await service.updateSettings({
      profitTargetUsd: 50,
      profitUsd: null,
      useProfitUsd: true,
    });
    expect(getRowSnapshot().profitUsd).toBe(50);
    expect(view.profitUsd).toBe(50);
  });

  it('maps profitTargetPctDayStart / profitTargetPctCurrent the same way', async () => {
    const { service, getRowSnapshot } = buildService();
    await service.updateSettings({
      profitTargetPctDayStart: 10,
      profitPctDayStart: null,
      profitTargetPctCurrent: 5,
      profitPctCurrent: null,
    });
    expect(getRowSnapshot().profitPctDayStart).toBe(10);
    expect(getRowSnapshot().profitPctCurrent).toBe(5);
  });

  it('still accepts canonical profitUsd alone without aliases', async () => {
    const { service, getRowSnapshot } = buildService();
    await service.updateSettings({ profitUsd: 25 });
    expect(getRowSnapshot().profitUsd).toBe(25);
  });
});
