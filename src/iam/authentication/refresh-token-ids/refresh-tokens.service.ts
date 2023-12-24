import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshTokens } from './refresh-tokens.entity';

@Injectable()
export class RefreshTokensService {
  constructor(
    @InjectRepository(RefreshTokens)
    private readonly refreshTokensRepository: Repository<RefreshTokens>,
  ) {}

  async insert(userId: number, tokenId: string) {
    const payload = {
      userId,
      tokenId,
    };
    return await this.refreshTokensRepository.save(payload);
  }

  async validate(userId: number, tokenId: string) {
    console.log('userId', userId, 'tokenId', tokenId);
  }

  async invalidate(userId: number) {
    await this.refreshTokensRepository.delete({ userId });
  }

  async getKey(userId: number): Promise<string> {
    return `user-${userId}`;
  }
}
