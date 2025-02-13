import { Module } from '@nestjs/common';
import { RefreshTokensService } from '@iam/authentication/refresh-token-storage/refresh-token-storage.service';
import { RefreshTokensController } from '@iam/authentication/refresh-token-storage/refresh-token-storage.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshTokens } from '@iam/authentication/refresh-token-storage/refresh-token-storage.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RefreshTokens])],
  controllers: [RefreshTokensController],
  providers: [RefreshTokensService],
  exports: [],
})
export class RefreshTokensModule {}
