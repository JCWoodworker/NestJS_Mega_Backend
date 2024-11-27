// TODO: Check all apps that use AUTH and make sure they are not using token.token anymore
// TODO: we are now returning authData - authData.tokens & authData.userInfo

import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Users } from 'src/users/entities/users.entity';
import { HashingService } from '../hashing/hashing.service';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { JwtService } from '@nestjs/jwt';
import jwtConfig from '../config/jwt.config';
import { ConfigType } from '@nestjs/config';
import { ActiveUserData } from '../interfaces/active-user-data.interface';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RefreshTokensService } from './refresh-token-storage/refresh-token-storage.service';
import { randomUUID } from 'crypto';
import { InvalidateRefreshTokenError } from './refresh-token-storage/invalidate-refresh-token-error';
import { OblUsersAndBusinesses } from 'src/subapps/onlybizlinks/entities/oblUsersAndBusinesses.entity';
import { OblBusinesses } from 'src/subapps/onlybizlinks/entities/oblBusinesses.entity';

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

    const businesses = await Promise.all(
      businessIds.map(async (businessId) => {
        const business = await this.businessesRepository.findOne({
          where: { id: businessId },
          relations: ['customLinks', 'socialLinks'],
        });
        return business;
      }),
    );

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

      const businesses = await Promise.all(
        businessIds.map(async (businessId) => {
          const business = await this.businessesRepository.findOne({
            where: { id: businessId },
            relations: ['customLinks', 'socialLinks'],
          });
          return business;
        }),
      );

      return { authData, businesses };
    } catch (err) {
      if (err instanceof InvalidateRefreshTokenError) {
        throw new UnauthorizedException('Access denied');
      }
      throw new UnauthorizedException();
    }
  }
}
