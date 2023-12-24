import { Injectable } from '@nestjs/common';

@Injectable()
export class RefreshTokenIdsStorage {
  // async insert(userId: number, tokenId: string): Promise<void> {}

  // async validate(userId: number, tokenId: string): Promise<boolean> {
  //   return true;
  // }

  // async invalidate(userId: number): Promise<void> {}

  async getKey(userId: number): Promise<string> {
    return `user-${userId}`;
  }
}
