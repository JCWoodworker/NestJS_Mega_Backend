import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Users } from '@users/entities/users.entity';

import { AdminUsersService } from '@schwab/admin/admin-users.service';

import {
  AccountDeletionRequest,
  AccountDeletionStatus,
} from './account-deletion-request.entity';

export interface DeletionRequestView {
  id: string;
  userId: string;
  email?: string;
  status: AccountDeletionStatus;
  reason: string | null;
  emailExport: boolean;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

@Injectable()
export class AccountDeletionService {
  constructor(
    @InjectRepository(AccountDeletionRequest)
    private readonly requests: Repository<AccountDeletionRequest>,
    @InjectRepository(Users)
    private readonly users: Repository<Users>,
    private readonly adminUsers: AdminUsersService,
  ) {}

  async getMine(userId: string): Promise<DeletionRequestView | null> {
    const row = await this.requests.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return row ? this.toView(row) : null;
  }

  async create(
    userId: string,
    params: { reason?: string; emailExport?: boolean },
  ): Promise<DeletionRequestView> {
    const pending = await this.requests.findOneBy({
      userId,
      status: AccountDeletionStatus.PENDING,
    });
    if (pending) {
      throw new ConflictException('A deletion request is already pending');
    }

    const row = this.requests.create({
      userId,
      status: AccountDeletionStatus.PENDING,
      reason: params.reason?.trim() || null,
      emailExport: params.emailExport ?? true,
    });
    const saved = await this.requests.save(row);
    return this.toView(saved);
  }

  async cancelMine(userId: string): Promise<DeletionRequestView> {
    const row = await this.requests.findOneBy({
      userId,
      status: AccountDeletionStatus.PENDING,
    });
    if (!row) {
      throw new NotFoundException('No pending deletion request');
    }
    row.status = AccountDeletionStatus.CANCELLED;
    row.resolvedAt = new Date();
    row.resolvedBy = userId;
    row.resolutionNote = 'Cancelled by user';
    return this.toView(await this.requests.save(row));
  }

  async listForAdmin(status?: string): Promise<DeletionRequestView[]> {
    const where =
      status && Object.values(AccountDeletionStatus).includes(status as AccountDeletionStatus)
        ? { status: status as AccountDeletionStatus }
        : {};
    const rows = await this.requests.find({
      where,
      order: { createdAt: 'DESC' },
      take: 200,
    });
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users =
      userIds.length === 0
        ? []
        : await this.users.findBy({ id: In(userIds) });
    const emailById = new Map(users.map((u) => [u.id, u.email]));
    return rows.map((r) => this.toView(r, emailById.get(r.userId)));
  }

  async reject(
    requestId: string,
    adminUserId: string,
    note?: string,
  ): Promise<DeletionRequestView> {
    const row = await this.requirePending(requestId);
    row.status = AccountDeletionStatus.REJECTED;
    row.resolvedAt = new Date();
    row.resolvedBy = adminUserId;
    row.resolutionNote = note?.trim() || null;
    const saved = await this.requests.save(row);
    const user = await this.users.findOneBy({ id: saved.userId });
    return this.toView(saved, user?.email);
  }

  async fulfill(
    requestId: string,
    adminUserId: string,
    emailExport?: boolean,
  ): Promise<{
    request: DeletionRequestView;
    purge: Awaited<ReturnType<AdminUsersService['purgeUser']>>;
  }> {
    const row = await this.requirePending(requestId);
    const user = await this.users.findOneBy({ id: row.userId });
    if (!user) {
      throw new NotFoundException('User for this request no longer exists');
    }

    const exportFlag = emailExport ?? row.emailExport;
    const purge = await this.adminUsers.purgeUser(row.userId, {
      confirmEmail: user.email,
      emailExport: exportFlag,
    });

    // User row is gone (CASCADE may remove this request). Re-upsert status if
    // the row survived, otherwise synthesize the fulfilled view.
    const stillThere = await this.requests.findOneBy({ id: requestId });
    if (stillThere) {
      stillThere.status = AccountDeletionStatus.FULFILLED;
      stillThere.resolvedAt = new Date();
      stillThere.resolvedBy = adminUserId;
      stillThere.resolutionNote = exportFlag
        ? 'Fulfilled with CSV export email'
        : 'Fulfilled without CSV export';
      const saved = await this.requests.save(stillThere);
      return { request: this.toView(saved, user.email), purge };
    }

    return {
      request: {
        id: requestId,
        userId: row.userId,
        email: user.email,
        status: AccountDeletionStatus.FULFILLED,
        reason: row.reason,
        emailExport: exportFlag,
        createdAt: row.createdAt,
        updatedAt: new Date(),
        resolvedAt: new Date(),
        resolvedBy: adminUserId,
        resolutionNote: 'Fulfilled (request row cascaded with user)',
      },
      purge,
    };
  }

  private async requirePending(id: string): Promise<AccountDeletionRequest> {
    const row = await this.requests.findOneBy({ id });
    if (!row) throw new NotFoundException('Deletion request not found');
    if (row.status !== AccountDeletionStatus.PENDING) {
      throw new BadRequestException(`Request is already ${row.status}`);
    }
    return row;
  }

  private toView(
    row: AccountDeletionRequest,
    email?: string,
  ): DeletionRequestView {
    return {
      id: row.id,
      userId: row.userId,
      email,
      status: row.status,
      reason: row.reason,
      emailExport: row.emailExport,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      resolvedAt: row.resolvedAt,
      resolvedBy: row.resolvedBy,
      resolutionNote: row.resolutionNote,
    };
  }
}
