import { ConflictException, NotFoundException } from '@nestjs/common';

import { AccountDeletionStatus } from './account-deletion-request.entity';
import { AccountDeletionService } from './account-deletion.service';

function build() {
  const rows: any[] = [];
  const requests = {
    findOne: jest.fn(async ({ where, order }: any) => {
      let list = rows.filter((r) =>
        Object.entries(where || {}).every(([k, v]) => r[k] === v),
      );
      if (order?.createdAt === 'DESC') list = [...list].reverse();
      return list[0] ?? null;
    }),
    findOneBy: jest.fn(async (where: any) => {
      return (
        rows.find((r) =>
          Object.entries(where).every(([k, v]) => r[k] === v),
        ) ?? null
      );
    }),
    find: jest.fn(async ({ where }: any) => {
      if (!where || Object.keys(where).length === 0) return [...rows];
      return rows.filter((r) =>
        Object.entries(where).every(([k, v]) => r[k] === v),
      );
    }),
    create: jest.fn((data: any) => ({
      id: 'req-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
      ...data,
    })),
    save: jest.fn(async (row: any) => {
      const i = rows.findIndex((r) => r.id === row.id);
      if (i >= 0) rows[i] = row;
      else rows.push(row);
      return row;
    }),
  };
  const users = {
    findOneBy: jest.fn(async ({ id }: any) =>
      id === 'user-1' ? { id: 'user-1', email: 'a@b.com' } : null,
    ),
    findBy: jest.fn(async () => [{ id: 'user-1', email: 'a@b.com' }]),
  };
  const adminUsers = {
    purgeUser: jest.fn(async () => ({
      deleted: true,
      email: 'a@b.com',
      exportEmailed: false,
      deletedCounts: {},
    })),
  };
  const service = new AccountDeletionService(
    requests as never,
    users as never,
    adminUsers as never,
  );
  return { service, requests, rows, adminUsers };
}

describe('AccountDeletionService', () => {
  it('creates a pending request', async () => {
    const { service } = build();
    const view = await service.create('user-1', { reason: 'bye' });
    expect(view.status).toBe(AccountDeletionStatus.PENDING);
    expect(view.reason).toBe('bye');
  });

  it('refuses a second pending request', async () => {
    const { service } = build();
    await service.create('user-1', {});
    await expect(service.create('user-1', {})).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('cancels a pending request', async () => {
    const { service } = build();
    await service.create('user-1', {});
    const cancelled = await service.cancelMine('user-1');
    expect(cancelled.status).toBe(AccountDeletionStatus.CANCELLED);
  });

  it('fulfills via admin purge', async () => {
    const { service, adminUsers, rows } = build();
    await service.create('user-1', { emailExport: false });
    adminUsers.purgeUser.mockImplementation(async () => {
      rows.length = 0;
      return {
        deleted: true,
        email: 'a@b.com',
        exportEmailed: false,
        deletedCounts: {},
      };
    });
    const result = await service.fulfill('req-1', 'admin-1', false);
    expect(result.purge.deleted).toBe(true);
    expect(result.request.status).toBe(AccountDeletionStatus.FULFILLED);
    expect(adminUsers.purgeUser).toHaveBeenCalledWith('user-1', {
      confirmEmail: 'a@b.com',
      emailExport: false,
    });
  });

  it('404s cancel when nothing pending', async () => {
    const { service } = build();
    await expect(service.cancelMine('user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
