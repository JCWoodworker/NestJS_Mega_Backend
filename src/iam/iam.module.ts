import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import authConfig from '@config/auth.config';

import { Users } from '@users/entities/users.entity';

import { SubappsService } from '@subapps/subapps.service';

import { OblBusinesses } from '@onlybizlinks/entities/oblBusinesses.entity';
import { OblUsersAndBusinesses } from '@onlybizlinks/entities/oblUsersAndBusinesses.entity';

import { AllowedEmailsController } from './authentication/allowed-emails.controller';
import { AuthAllowlistService } from './authentication/auth-allowlist.service';
import { AuthenticationController } from './authentication/authentication.controller';
import { AuthenticationService } from './authentication/authentication.service';
import { AccessTokenGuard } from './authentication/guards/access-token/access-token.guard';
import { RefreshTokens } from './authentication/refresh-token-storage/refresh-token-storage.entity';
import { RefreshTokensModule } from './authentication/refresh-token-storage/refresh-token-storage.module';
import { RefreshTokensService } from './authentication/refresh-token-storage/refresh-token-storage.service';
import { GoogleAuthenticationController } from './authentication/social/google-authentication.controller';
import { GoogleAuthenticationService } from './authentication/social/google-authentication.service';
import jwtConfig from './config/jwt.config';
import { AuthAllowedEmail } from './entities/auth-allowed-email.entity';
import { BcryptService } from './hashing/bcrypt.service';
import { HashingService } from './hashing/hashing.service';

@Module({
  providers: [
    {
      provide: HashingService,
      useClass: BcryptService,
    },
    AccessTokenGuard,
    AuthenticationService,
    AuthAllowlistService,
    RefreshTokensService,
    GoogleAuthenticationService,
    SubappsService,
  ],
  imports: [
    TypeOrmModule.forFeature([
      Users,
      RefreshTokens,
      OblUsersAndBusinesses,
      OblBusinesses,
      AuthAllowedEmail,
    ]),
    JwtModule.registerAsync(jwtConfig.asProvider()),
    ConfigModule.forFeature(jwtConfig),
    ConfigModule.forFeature(authConfig),
    RefreshTokensModule,
  ],
  exports: [AuthAllowlistService],
  controllers: [
    AuthenticationController,
    GoogleAuthenticationController,
    AllowedEmailsController,
  ],
})
export class IamModule {}
