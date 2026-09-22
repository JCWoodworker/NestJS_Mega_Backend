import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

import { AdminUsersService } from './admin-users.service';

const OPENED = 1_700_000_000_000;

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'a@b.com',
    role: 'basic',
    isLocked: false,
    isEmailVerified: true,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    lastLoginAt: null,
    signupSources: ['strikedesk'],
    googleId: null,
    first_name: null,
    last_name: null,
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

function emptyRepo(extra: Record<string, unknown> = {}) {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOneBy: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    ...extra,
  };
}

function build(options: {
  users?: ReturnType<typeof user>[];
  tokens?: Record<string, unknown>[];
  botStates?: Record<string, unknown>[];
  trades?: Record<string, unknown>[];
  foreignCounts?: number[];
}) {
  const usersList = options.users ?? [user()];
  const foreign = options.foreignCounts ?? [0, 0, 0, 0];
  let foreignIdx = 0;
  const manager = {
    query: jest.fn().mockImplementation(async () => {
      const count = foreign[foreignIdx] ?? 0;
      foreignIdx += 1;
      return [{ count }];
    }),
    transaction: jest.fn().mockImplementation(async (fn) => {
      const txManager = {
        delete: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      return fn(txManager);
    }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const usersRepository = {
    find: jest.fn().mockResolvedValue(usersList),
    findOneBy: jest
      .fn()
      .mockImplementation(async ({ id }: { id: string }) =>
        usersList.find((u) => u.id === id) ?? null,
      ),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    manager,
  };
  const tokenRepository = {
    find: jest.fn().mockResolvedValue(options.tokens ?? []),
    findOneBy: jest.fn().mockImplementation(async ({ userId }: { userId: string }) =>
      (options.tokens ?? []).find((t) => t.userId === userId) ?? null,
    ),
    count: jest.fn().mockResolvedValue((options.tokens ?? []).length),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const botStateRepository = {
    find: jest.fn().mockResolvedValue(options.botStates ?? []),
    count: jest.fn().mockResolvedValue(0),
  };
  const realizedRepository = {
    find: jest.fn().mockResolvedValue(options.trades ?? []),
    count: jest.fn().mockResolvedValue((options.trades ?? []).length),
  };

  const emailService = {
    sendAccountExportEmail: jest.fn().mockResolvedValue(undefined),
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  };
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('signed-token'),
  };
  const jwtConfiguration = {
    secret: 'test',
    audience: 'test',
    issuer: 'test',
  };

  const service = new AdminUsersService(
    usersRepository as never,
    tokenRepository as never,
    botStateRepository as never,
    emptyRepo() as never,
    emptyRepo() as never,
    emptyRepo() as never,
    emptyRepo() as never,
    emptyRepo() as never,
    emptyRepo() as never,
    realizedRepository as never,
    emptyRepo() as never,
    emptyRepo() as never,
    emptyRepo() as never,
    emptyRepo() as never,
    emptyRepo() as never,
    emptyRepo({ delete: jest.fn().mockResolvedValue({ affected: 2 }) }) as never,
    emailService as never,
    jwtService as never,
    jwtConfiguration as never,
  );

  return {
    service,
    usersRepository,
    tokenRepository,
    realizedRepository,
    emailService,
    manager,
  };
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
      tokens: [{ userId: user().id, accountHash: null }],
    });

    const [row] = await service.getOverview({});

    expect(row.schwabConnected).toBe(true);
    expect(row.accountHashResolved).toBe(false);
    expect(row.insight).toBeNull();
    expect(realizedRepository.find).not.toHaveBeenCalled();
  });

  it('computes insight for a connected, resolved user from their own trades only', async () => {
    const { service, realizedRepository } = build({
      users: [user()],
      tokens: [{ userId: user().id, accountHash: 'HASH-1' }],
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
      tokens: [{ userId: user().id, accountHash: 'HASH-1' }],
    });

    await service.getOverview({ from: '2026-01-01', to: '2026-01-31' });

    const call = realizedRepository.find.mock.calls[0][0];
    expect(call.where.accountHash).toBe('HASH-1');
    expect(call.where.closedAt).toBeDefined();
  });

  it('flags usesBot from current bot_state mode even with no trades yet', async () => {
    const { service } = build({
      users: [user()],
      tokens: [{ userId: user().id, accountHash: 'HASH-1' }],
      botStates: [{ userId: user().id, mode: 'BOT' }],
      trades: [],
    });

    const [row] = await service.getOverview({});

    expect(row.usesBot).toBe(true);
  });

  it('flags usesBot from historical bot-source trades when bot_state is MANUAL', async () => {
    const { service } = build({
      users: [user()],
      tokens: [{ userId: user().id, accountHash: 'HASH-1' }],
      botStates: [{ userId: user().id, mode: 'MANUAL' }],
      trades: [realizedTrade({ source: 'BOT_PAPER' })],
    });

    const [row] = await service.getOverview({});

    expect(row.usesBot).toBe(true);
  });

  it('does not flag usesBot for a manual-only trader who has never armed the bot', async () => {
    const { service } = build({
      users: [user()],
      tokens: [{ userId: user().id, accountHash: 'HASH-1' }],
      botStates: [{ userId: user().id, mode: 'MANUAL' }],
      trades: [realizedTrade({ source: 'MANUAL_LIVE' })],
    });

    const [row] = await service.getOverview({});

    expect(row.usesBot).toBe(false);
  });

  it('keeps each user scoped to only their own trades', async () => {
    const u1 = user({ id: '11111111-1111-1111-1111-111111111111' });
    const u2 = user({
      id: '22222222-2222-2222-2222-222222222222',
      email: 'c@d.com',
    });
    const { service, realizedRepository } = build({
      users: [u1, u2],
      tokens: [
        { userId: u1.id, accountHash: 'HASH-1' },
        { userId: u2.id, accountHash: 'HASH-2' },
      ],
    });

    await service.getOverview({});

    const hashesQueried = realizedRepository.find.mock.calls.map(
      (call) => call[0].where.accountHash,
    );
    expect(hashesQueried).toEqual(['HASH-1', 'HASH-2']);
  });

  it('locks a user', async () => {
    const { service, usersRepository } = build({});
    const result = await service.setLocked(user().id, true);
    expect(result.isLocked).toBe(true);
    expect(usersRepository.update).toHaveBeenCalledWith(user().id, {
      isLocked: true,
    });
  });

  it('refuses purge when signup_sources include another product', async () => {
    const { service } = build({
      users: [user({ signupSources: ['strikedesk', 'mycuttingboard'] })],
    });
    await expect(
      service.purgeUser(user().id, { confirmEmail: 'a@b.com' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses purge when confirmEmail mismatches', async () => {
    const { service } = build({});
    await expect(
      service.purgeUser(user().id, { confirmEmail: 'wrong@b.com' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aborts purge when export email fails', async () => {
    const { service, emailService, manager } = build({});
    emailService.sendAccountExportEmail.mockRejectedValue(
      new Error('Resend down'),
    );
    await expect(
      service.purgeUser(user().id, {
        confirmEmail: 'a@b.com',
        emailExport: true,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(manager.transaction).not.toHaveBeenCalled();
  });

  it('purges after a successful optional export', async () => {
    const { service, emailService, manager } = build({});
    const result = await service.purgeUser(user().id, {
      confirmEmail: 'a@b.com',
      emailExport: true,
    });
    expect(result.deleted).toBe(true);
    expect(result.exportEmailed).toBe(true);
    expect(emailService.sendAccountExportEmail).toHaveBeenCalled();
    expect(manager.transaction).toHaveBeenCalled();
  });
});
