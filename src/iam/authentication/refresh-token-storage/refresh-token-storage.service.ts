/*
We will want to make sure we delete the refresh token both when the user signs out
and especially when a user is deleted from the system.

Set up a relationship between the user and the refresh token storage with cascade on delete.
*/

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshTokens } from './refresh-token-storage.entity';

@Injectable()
export class RefreshTokensService {
  constructor(
    @InjectRepository(RefreshTokens)
    private readonly refreshTokensRepository: Repository<RefreshTokens>,
  ) {}

  async insertRefreshToken(userId: string, tokenId: string) {
    try {
      const payload = {
        userId,
        tokenId,
      };
      return await this.refreshTokensRepository.upsert(payload, ['userId']);
    } catch (err) {
      if (err.code === '23505') {
        return { ERROR: err.message, DETAIL: err.detail };
      } else {
        return { ERROR: err.message, HUH: 'Something is very wrong here' };
      }
    }
  }

  async validateRefreshToken(
    userId: string,
    tokenId: string,
  ): Promise<boolean> {
    const storedId = (await this.refreshTokensRepository.findOneBy({ userId }))
      ?.tokenId;
    if (storedId !== tokenId) {
      return false;
    }

    return true;
  }

  async invalidateRefreshToken(userId: string): Promise<void> {
    const result = await this.refreshTokensRepository.delete({ userId });
    if (result.affected === 0) {
      return;
    }

    return;
  }
}
