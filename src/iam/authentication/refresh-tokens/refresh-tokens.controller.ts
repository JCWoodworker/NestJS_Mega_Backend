import { Controller, Post, Body } from '@nestjs/common';
import { RefreshTokensService } from './refresh-tokens.service';

@Controller('refresh-tokens')
export class RefreshTokensController {
  constructor(private readonly refreshTokensService: RefreshTokensService) {}

  @Post('insert')
  async insert(@Body() userId: number, tokenId: string) {
    this.refreshTokensService.insert(userId, tokenId);
  }
}
