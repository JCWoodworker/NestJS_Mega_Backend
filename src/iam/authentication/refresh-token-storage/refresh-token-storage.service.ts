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

  async insertRefreshToken(userId: number, tokenId: string) {
    console.log('inserting refresh token', { userId, tokenId });
    try {
      const payload = {
        userId,
        tokenId,
      };
      return await this.refreshTokensRepository.upsert(payload, ['userId']);
    } catch (err) {
      if (err.code === '23505') {
        console.log(`FAILED TO INSERT REFRESH TOKEN - ${err.message}`);
        return { ERROR: err.message, DETAIL: err.detail };
      } else {
        console.log(`FAILED TO INSERT REFRESH TOKEN - ${err.message}`);
        return { ERROR: err.message, HUH: 'Something is very wrong here' };
      }
    }
  }

  async validateRefreshToken(
    userId: number,
    tokenId: string,
  ): Promise<boolean> {
    console.log('validating refresh token', { userId, tokenId });
    const storedId = (await this.refreshTokensRepository.findOneBy({ userId }))
      ?.tokenId;
    if (storedId !== tokenId) {
      console.log('refresh token mismatch', { storedId, tokenId });
      return false;
    }
    console.log('refresh token match', { storedId, tokenId });
    return true;
  }

  async invalidateRefreshToken(userId: number): Promise<void> {
    console.log('invalidating refresh token', { userId });
    const result = await this.refreshTokensRepository.delete({ userId });
    if (result.affected === 0) {
      console.log('refresh token not found', { userId });
      return;
    }
    console.log(`refresh token invalidated for user ${userId}`);
    return;
  }
}
