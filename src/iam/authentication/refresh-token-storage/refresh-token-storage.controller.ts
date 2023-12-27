import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { RefreshTokensService } from './refresh-token-storage.service';
import { Auth } from '../../decorators/auth.decorator';
import { AuthType } from '../../enums/auth-type.enum';

@Auth(AuthType.None)
@Controller('refresh-tokens')
export class RefreshTokensController {
  constructor(private readonly refreshTokensService: RefreshTokensService) {}

  @HttpCode(HttpStatus.OK)
  @Post('insert-refresh-token')
  async insertRefreshToken(@Body() { userId, tokenId }) {
    return this.refreshTokensService.insertRefreshToken(userId, tokenId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('validate-refresh-token')
  async validateRefreshToken(@Body() { userId, tokenId }) {
    return this.refreshTokensService.validateRefreshToken(userId, tokenId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('invalidate-refresh-token')
  async invalidateRefreshToken(@Body() { userId }) {
    return this.refreshTokensService.invalidateRefreshToken(userId);
  }
}
