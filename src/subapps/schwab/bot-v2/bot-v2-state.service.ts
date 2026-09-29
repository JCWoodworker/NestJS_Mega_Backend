import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { requireUserId } from '@schwab/shared/schwab-user-context';

import { BotV2State } from './entities/bot-v2-state.entity';

@Injectable()
export class BotV2StateService {
  constructor(
    @InjectRepository(BotV2State)
    private readonly states: Repository<BotV2State>,
  ) {}

  async get(userId = requireUserId()): Promise<BotV2State> {
    const existing = await this.states.findOneBy({ userId });
    if (existing) return existing;
    return this.states.save(
      this.states.create({
        userId,
        mode: 'MANUAL',
        running: false,
        paperEquity: 10000,
        paperSettledCash: 10000,
        openPosition: null,
      }),
    );
  }

  async save(row: BotV2State): Promise<BotV2State> {
    return this.states.save(row);
  }

  async armedUserIds(): Promise<string[]> {
    const rows = await this.states.find({
      where: { mode: 'BOT', running: true },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }
}
