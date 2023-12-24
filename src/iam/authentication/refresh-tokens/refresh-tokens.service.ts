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
    return this.refreshTokensRepository.save(payload);
  }
}
