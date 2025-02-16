// TODO: Check all apps that use AUTH and make sure they are not using token.token anymore
// TODO: we are now returning authData - authData.tokens & authData.userInfo

import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';

import { Users } from '@users/entities/users.entity';

import { RefreshTokenDto } from '@iam/authentication/dto/refresh-token.dto';
import { SignInDto } from '@iam/authentication/dto/sign-in.dto';
import { SignUpDto } from '@iam/authentication/dto/sign-up.dto';
import { InvalidateRefreshTokenError } from '@iam/authentication/refresh-token-storage/invalidate-refresh-token-error';
import { RefreshTokensService } from '@iam/authentication/refresh-token-storage/refresh-token-storage.service';
import jwtConfig from '@iam/config/jwt.config';
import { ActiveUserData } from '@iam/interfaces/active-user-data.interface';

import { OblBusinesses } from '@onlybizlinks/entities/oblBusinesses.entity';
import { OblUsersAndBusinesses } from '@onlybizlinks/entities/oblUsersAndBusinesses.entity';

import { HashingService } from '../hashing/hashing.service';

@Injectable()
export class AuthenticationService {
  constructor(
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
    @InjectRepository(OblUsersAndBusinesses)
    private readonly usersAndBusinessesRepository: Repository<OblUsersAndBusinesses>,
    @InjectRepository(OblBusinesses)
    private readonly businessesRepository: Repository<OblBusinesses>,
    private readonly refreshTokenStorageService: RefreshTokensService,
    private readonly hashingService: HashingService,
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  async signUp(signUpDto: SignUpDto) {
    try {
      const user = new Users();
      user.email = signUpDto.email.toLowerCase();
      user.password = await this.hashingService.hash(signUpDto.password);
      const newUser = await this.usersRepository.save(user);
      debugger;
      return { message: `User ${newUser.email} created successfully` };
    } catch (err) {
      const pgUniqueViolationErrorCode = '23505';
      if (err.code === pgUniqueViolationErrorCode) {
        throw new ConflictException();
      }
      throw err;
    }
  }

  async signIn(signInDto: SignInDto) {
    const userEmail = signInDto.email.toLowerCase();
    const user = await this.usersRepository.findOneBy({
      email: userEmail,
    });
    if (!user) {
      throw new UnauthorizedException('User does not exists');
    }
    const isEqual = await this.hashingService.compare(
      signInDto.password,
      user.password,
    );
    if (!isEqual) {
      throw new UnauthorizedException('Password does not match');
    }
    const authData = await this.generateTokens(user);

    // Here we are checking if the user is connected with any businesses in OnlyBizLinks
    // If they are we are returning an extra field with the user's business access
    const userBusinessAccess = await this.usersAndBusinessesRepository.find({
      where: { user_id: user.id },
    });
    const businessIds = userBusinessAccess.map((access) => access.business_id);

    if (userBusinessAccess.length === 0) {
      return { authData };
    }

    const businesses = await this.getUserBusinessesAndRelations(businessIds);

    return { authData, businesses };
  }

  async generateTokens(user: Users) {
    const refreshTokenId = randomUUID();
    const [accessToken, refreshToken] = await Promise.all([
      this.signToken<Partial<ActiveUserData>>(
        user.id,
        this.jwtConfiguration.accessTokenTtl,
        { email: user.email, role: user.role },
      ),
      this.signToken<Partial<ActiveUserData>>(
        user.id,
        this.jwtConfiguration.refreshTokenTtl,
        {
          refreshTokenId,
        },
      ),
    ]);
    await this.refreshTokenStorageService.insertRefreshToken(
      user.id,
      refreshTokenId,
    );

    // TODO: return user's business access as well?
    return {
      userInfo: {
        firstName: user.first_name,
        lastName: user.last_name,
        imageUrl: user.image_url,
        role: user.role,
      },
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }

  private async signToken<T>(userId: string, expiresIn: number, payload?: T) {
    return await this.jwtService.signAsync(
      {
        sub: userId,
        ...payload,
      },
      {
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
        secret: this.jwtConfiguration.secret,
        expiresIn,
      },
    );
  }

  async refreshTokens(refreshTokenDto: RefreshTokenDto) {
    try {
      const { sub, refreshTokenId } = await this.jwtService.verifyAsync<
        Pick<ActiveUserData, 'sub'> & { refreshTokenId: string }
      >(refreshTokenDto.refreshToken, {
        secret: this.jwtConfiguration.secret,
        issuer: this.jwtConfiguration.issuer,
        audience: this.jwtConfiguration.audience,
      });
      const user = await this.usersRepository.findOneByOrFail({
        id: sub,
      });
      const isValid =
        await this.refreshTokenStorageService.validateRefreshToken(
          user.id,
          refreshTokenId,
        );

      if (isValid) {
        await this.refreshTokenStorageService.invalidateRefreshToken(user.id);
      } else {
        throw new Error('Invalid refresh token');
      }
      const authData = await this.generateTokens(user);

      const userBusinessAccess = await this.usersAndBusinessesRepository.find({
        where: { user_id: user.id },
      });
      const businessIds = userBusinessAccess.map(
        (access) => access.business_id,
      );

      if (userBusinessAccess.length === 0) {
        return { authData };
      }

      const businesses = await this.getUserBusinessesAndRelations(businessIds);

      return { authData, businesses };
    } catch (err) {
      debugger;
      if (err instanceof InvalidateRefreshTokenError) {
        throw new UnauthorizedException('Access denied');
      }
      throw new UnauthorizedException();
    }
  }

  async getUserBusinessesAndRelations(businessIds: number[]) {
    let businesses: OblBusinesses[];
    try {
      businesses = await Promise.all(
        businessIds.map(async (businessId) => {
          const business = await this.businessesRepository.findOne({
            where: { id: businessId },
            relations: ['customLinks', 'socialLinks'],
          });
          return business;
        }),
      );
    } catch (err) {
      console.log(err);
    }

    return businesses;
  }
}
