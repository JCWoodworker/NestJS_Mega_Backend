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
    const payload = {
      userId,
      tokenId,
    };
    return await this.refreshTokensRepository.save(payload);
  }

  async validateRefreshToken(
    userId: number,
    tokenId: string,
  ): Promise<boolean> {
    console.log('validating refresh token', { userId, tokenId });
    return false;
  }

  async invalidateRefreshToken(userId: number): Promise<void> {
    console.log('invalidating refresh token', { userId });
    return;
  }
}
