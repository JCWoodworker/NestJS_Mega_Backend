import { Module } from '@nestjs/common';
import { RefreshTokensService } from './refresh-token-storage.service';
import { RefreshTokensController } from './refresh-token-storage.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshTokens } from './refresh-token-storage.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RefreshTokens])],
  controllers: [RefreshTokensController],
  providers: [RefreshTokensService],
  exports: [],
})
export class RefreshTokensModule {}
