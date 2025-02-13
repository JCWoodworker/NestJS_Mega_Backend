import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RefreshTokensController } from '@iam/authentication/refresh-token-storage/refresh-token-storage.controller';
import { RefreshTokens } from '@iam/authentication/refresh-token-storage/refresh-token-storage.entity';
import { RefreshTokensService } from '@iam/authentication/refresh-token-storage/refresh-token-storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([RefreshTokens])],
  controllers: [RefreshTokensController],
  providers: [RefreshTokensService],
  exports: [],
})
export class RefreshTokensModule {}
