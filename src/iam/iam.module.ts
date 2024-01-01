import { Module } from '@nestjs/common';
import { HashingService } from './hashing/hashing.service';
import { BcryptService } from './hashing/bcrypt.service';
import { AuthenticationController } from './authentication/authentication.controller';
import { AuthenticationService } from './authentication/authentication.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Users } from 'src/users/entities/users.entity';
import { JwtModule } from '@nestjs/jwt';
import jwtConfig from './config/jwt.config';
import { ConfigModule } from '@nestjs/config';
import { AccessTokenGuard } from './authentication/guards/access-token/access-token.guard';
import { RefreshTokensModule } from './authentication/refresh-token-storage/refresh-token-storage.module';
import { RefreshTokensService } from './authentication/refresh-token-storage/refresh-token-storage.service';
import { RefreshTokens } from './authentication/refresh-token-storage/refresh-token-storage.entity';
import { GoogleAuthenticationService } from './authentication/social/google-authentication.service';
import { GoogleAuthenticationController } from './authentication/social/google-authentication.controller';

@Module({
  providers: [
    {
      provide: HashingService,
      useClass: BcryptService,
    },
    AccessTokenGuard,
    AuthenticationService,
    RefreshTokensService,
    GoogleAuthenticationService,
  ],
  imports: [
    TypeOrmModule.forFeature([Users, RefreshTokens]),
    JwtModule.registerAsync(jwtConfig.asProvider()),
    ConfigModule.forFeature(jwtConfig),
    RefreshTokensModule,
  ],
  exports: [],
  controllers: [AuthenticationController, GoogleAuthenticationController],
})
export class IamModule {}
