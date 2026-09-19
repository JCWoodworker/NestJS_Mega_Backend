import { AdminUsersService } from './admin-users.service';

const OPENED = 1_700_000_000_000;

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'a@b.com',
    role: 'basic',
    isLocked: false,
    isEmailVerified: true,
    created_at: new Date('2026-01-01'),
    lastLoginAt: null,
    signupSources: ['strikedesk'],
    ...overrides,
  };
}

function realizedTrade(overrides: Record<string, unknown> = {}) {
  return {
    symbol: 'SPY',
    direction: 'CALL',
    quantity: '1',
    openPrice: '1.00',
    closePrice: '1.20',
    openedAt: new Date(OPENED),
    closedAt: new Date(OPENED + 60_000),
    realizedPnl: '20.00',
    source: 'MANUAL_LIVE',
    ...overrides,
  };
}

function build(options: {
  users?: ReturnType<typeof user>[];
  tokens?: Record<string, unknown>[];
  botStates?: Record<string, unknown>[];
  trades?: Record<string, unknown>[];
}) {
  const usersRepository = {
    find: jest.fn().mockResolvedValue(options.users ?? [user()]),
  };
  const tokenRepository = {
    find: jest.fn().mockResolvedValue(options.tokens ?? []),
  };
  const botStateRepository = {
    find: jest.fn().mockResolvedValue(options.botStates ?? []),
  };
  const realizedRepository = {
    find: jest.fn().mockResolvedValue(options.trades ?? []),
  };

  const service = new AdminUsersService(
    usersRepository as never,
    tokenRepository as never,
    botStateRepository as never,
    realizedRepository as never,
  );

  return { service, usersRepository, tokenRepository, realizedRepository };
}

describe('AdminUsersService', () => {
  it('queries only users whose signup_sources include strikedesk', async () => {
    const { service, usersRepository } = build({ users: [user()] });

    await service.getOverview({});

    expect(usersRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          signupSources: expect.anything(),
        }),
      }),
    );
  });

  it('marks a user without a schwab_tokens row as not connected', async () => {
    const { service } = build({ users: [user()], tokens: [] });

    const [row] = await service.getOverview({});

    expect(row.schwabConnected).toBe(false);
    expect(row.accountHashResolved).toBe(false);
    expect(row.insight).toBeNull();
  });

  it('marks a connected user with no resolved hash as connected but without stats', async () => {
    const { service, realizedRepository } = build({
      users: [user()],
      tokens: [{ userId: 'user-1', accountHash: null }],
    });

    const [row] = await service.getOverview({});

    expect(row.schwabConnected).toBe(true);
    expect(row.accountHashResolved).toBe(false);
    expect(row.insight).toBeNull();
    // No hash to query against, so no point hitting the trades table at all.
    expect(realizedRepository.find).not.toHaveBeenCalled();
  });

  it('computes insight for a connected, resolved user from their own trades only', async () => {
    const { service, realizedRepository } = build({
      users: [user()],
      tokens: [{ userId: 'user-1', accountHash: 'HASH-1' }],
      trades: [
        realizedTrade({ realizedPnl: '20.00' }),
        realizedTrade({ realizedPnl: '-5.00' }),
      ],
    });

    const [row] = await service.getOverview({});

    expect(row.schwabConnected).toBe(true);
    expect(row.accountHashResolved).toBe(true);
    expect(row.insight?.trades).toBe(2);
    expect(row.insight?.grossPnl).toBe(15);
    expect(realizedRepository.find).toHaveBeenCalledWith({
      where: { accountHash: 'HASH-1' },
    });
  });

  it('scopes the trades query to the requested date range', async () => {
    const { service, realizedRepository } = build({
      users: [user()],
      tokens: [{ userId: 'user-1', accountHash: 'HASH-1' }],
    });

    await service.getOverview({ from: '2026-01-01', to: '2026-01-31' });

    const call = realizedRepository.find.mock.calls[0][0];
    expect(call.where.accountHash).toBe('HASH-1');
    expect(call.where.closedAt).toBeDefined();
  });

  /** "Uses bot" from bot_state (currently armed) even with zero trades so
   * far — armed-but-quiet is a real, common state, not "not using it". */
  it('flags usesBot from current bot_state mode even with no trades yet', async () => {
    const { service } = build({
      users: [user()],
      tokens: [{ userId: 'user-1', accountHash: 'HASH-1' }],
      botStates: [{ userId: 'user-1', mode: 'BOT' }],
      trades: [],
    });

    const [row] = await service.getOverview({});

    expect(row.usesBot).toBe(true);
  });

  /** Or from history, even if the bot is not currently armed. */
  it('flags usesBot from historical bot-source trades when bot_state is MANUAL', async () => {
    const { service } = build({
      users: [user()],
      tokens: [{ userId: 'user-1', accountHash: 'HASH-1' }],
      botStates: [{ userId: 'user-1', mode: 'MANUAL' }],
      trades: [realizedTrade({ source: 'BOT_PAPER' })],
    });

    const [row] = await service.getOverview({});

    expect(row.usesBot).toBe(true);
  });

  it('does not flag usesBot for a manual-only trader who has never armed the bot', async () => {
    const { service } = build({
      users: [user()],
      tokens: [{ userId: 'user-1', accountHash: 'HASH-1' }],
      botStates: [{ userId: 'user-1', mode: 'MANUAL' }],
      trades: [realizedTrade({ source: 'MANUAL_LIVE' })],
    });

    const [row] = await service.getOverview({});

    expect(row.usesBot).toBe(false);
  });

  it('keeps each user scoped to only their own trades', async () => {
    const { service, realizedRepository } = build({
      users: [user({ id: 'user-1' }), user({ id: 'user-2', email: 'c@d.com' })],
      tokens: [
        { userId: 'user-1', accountHash: 'HASH-1' },
        { userId: 'user-2', accountHash: 'HASH-2' },
      ],
    });

    await service.getOverview({});

    const hashesQueried = realizedRepository.find.mock.calls.map(
      (call) => call[0].where.accountHash,
    );
    expect(hashesQueried).toEqual(['HASH-1', 'HASH-2']);
  });
});
