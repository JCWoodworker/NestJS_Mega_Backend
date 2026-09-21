import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RefreshTokens } from '@iam/authentication/refresh-token-storage/refresh-token-storage.entity';
import { RefreshTokensService } from '@iam/authentication/refresh-token-storage/refresh-token-storage.service';

/**
 * Storage only — deliberately exposes no controller. Refresh tokens are issued
 * and rotated exclusively through `AuthenticationService`, which verifies the
 * presented token before touching this row. An HTTP surface taking a raw
 * `userId` would let a caller mint or clear anyone's refresh token.
 */
@Module({
  imports: [TypeOrmModule.forFeature([RefreshTokens])],
  providers: [RefreshTokensService],
  exports: [RefreshTokensService],
})
export class RefreshTokensModule {}
