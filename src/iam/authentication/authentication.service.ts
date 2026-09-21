import {
  BadRequestException,
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

import { ACCESS_TOKEN_PURPOSE } from '@iam/authentication/access-token-payload.util';
import { AuthAllowlistService } from '@iam/authentication/auth-allowlist.service';
import { isDisposableEmail } from '@iam/authentication/disposable-email.util';
import { RefreshTokenDto } from '@iam/authentication/dto/refresh-token.dto';
import { SignInDto } from '@iam/authentication/dto/sign-in.dto';
import { SignUpDto } from '@iam/authentication/dto/sign-up.dto';
import { InvalidateRefreshTokenError } from '@iam/authentication/refresh-token-storage/invalidate-refresh-token-error';
import { RefreshTokensService } from '@iam/authentication/refresh-token-storage/refresh-token-storage.service';
import {
  isSignupSource,
  withSignupSource,
  type SignupSource,
} from '@iam/authentication/signup-source.util';
import jwtConfig from '@iam/config/jwt.config';
import { EmailService } from '@iam/email/email.service';
import { ActiveUserData } from '@iam/interfaces/active-user-data.interface';

import { OblBusinesses } from '@onlybizlinks/entities/oblBusinesses.entity';
import { OblUsersAndBusinesses } from '@onlybizlinks/entities/oblUsersAndBusinesses.entity';

import { HashingService } from '../hashing/hashing.service';

/** 24h — long enough that "check your email tomorrow" still works, short
 * enough that a leaked link in a forwarded email doesn't stay live for months. */
const EMAIL_VERIFY_TOKEN_TTL_SECONDS = 24 * 60 * 60;
/** Distinguishes a verification token from an access/refresh token signed
 * with the same secret — checked on verify so one token type can never be
 * replayed as the other. */
const EMAIL_VERIFY_PURPOSE = 'email-verify';

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
    private readonly allowlistService: AuthAllowlistService,
    private readonly emailService: EmailService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  async signUp(signUpDto: SignUpDto) {
    const email = this.allowlistService.normalizeEmail(signUpDto.email);

    // Only meaningful once sign-up is open; harmless while the allowlist is
    // closed. A speed bump rather than a control — email verification is the
    // real answer. See disposable-email.util.ts.
    if (isDisposableEmail(email)) {
      throw new BadRequestException(
        'Please sign up with a permanent email address.',
      );
    }

    await this.allowlistService.assertCanAuthenticate(email);
    try {
      const user = new Users();
      user.email = email;
      user.password = await this.hashingService.hash(signUpDto.password);
      const source = isSignupSource(signUpDto.signupSource)
        ? signUpDto.signupSource
        : null;
      user.signupSources = withSignupSource([], source);
      const newUser = await this.usersRepository.save(user);

      // Best-effort: a Resend outage must not fail account creation. The
      // resend-verification endpoint is the recovery path if this silently
      // doesn't land.
      try {
        const token = await this.signToken(
          newUser.id,
          EMAIL_VERIFY_TOKEN_TTL_SECONDS,
          { purpose: EMAIL_VERIFY_PURPOSE },
        );
        await this.emailService.sendVerificationEmail(newUser.email, token);
      } catch {
        // Swallowed intentionally — see comment above.
      }

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
    const userEmail = this.allowlistService.normalizeEmail(signInDto.email);
    const user = await this.usersRepository.findOneBy({
      email: userEmail,
    });
    if (!user) {
      throw new UnauthorizedException('User does not exists');
    }
    await this.allowlistService.assertCanAuthenticate(userEmail, user);
    // Accounts created via Google OAuth (see GoogleAuthenticationService)
    // never get a `password` set, so bcrypt.compare would throw on a null
    // hash here instead of failing cleanly. Treat that as "wrong
    // credentials" rather than letting an unhandled exception 500.
    if (!user.password) {
      throw new UnauthorizedException(
        'This account has no password set (likely signed up via Google) — sign in with Google instead',
      );
    }
    const isEqual = await this.hashingService.compare(
      signInDto.password,
      user.password,
    );
    if (!isEqual) {
      throw new UnauthorizedException('Password does not match');
    }
    await this.touchLastLogin(user.id);
    await this.appendSignupSource(
      user,
      isSignupSource(signInDto.signupSource) ? signInDto.signupSource : null,
    );
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
      this.signToken<Partial<ActiveUserData> & { purpose: string }>(
        user.id,
        this.jwtConfiguration.accessTokenTtl,
        {
          email: user.email,
          role: user.role,
          emailVerified: user.isEmailVerified,
          // Marks the token class explicitly. Guards currently reject only
          // tokens that positively identify as something else, so tokens
          // issued before this claim existed keep working; once they have all
          // expired this marker can become mandatory.
          purpose: ACCESS_TOKEN_PURPOSE,
        },
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
        emailVerified: user.isEmailVerified,
      },
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }

  /**
   * Drops the caller's stored refresh token, so the session cannot be renewed
   * once the current access token expires.
   *
   * Idempotent — a second call, or one from a session whose row was already
   * rotated away, succeeds rather than erroring, since the caller's intent is
   * satisfied either way and the frontend clears local state regardless.
   */
  async signOut(userId: string): Promise<{ message: string }> {
    await this.refreshTokenStorageService.invalidateRefreshToken(userId);
    return { message: 'Signed out' };
  }

  /** Not called on refresh — only an actual sign-in counts, so this reflects
   * when someone last opened the app, not how long their session has been
   * silently kept alive by token rotation. */
  async touchLastLogin(userId: string): Promise<void> {
    await this.usersRepository.update(userId, { lastLoginAt: new Date() });
  }

  /**
   * Adds a product slug to `signup_sources` when an existing account signs
   * in from another frontend. No-op when the source is missing or already
   * present. Mutates `user.signupSources` in memory so callers that reuse
   * the entity see the updated list.
   */
  async appendSignupSource(
    user: Users,
    source: SignupSource | null,
  ): Promise<void> {
    if (!source) return;
    const next = withSignupSource(user.signupSources, source);
    if (next.length === (user.signupSources?.length ?? 0)) return;
    user.signupSources = next;
    await this.usersRepository.update(user.id, { signupSources: next });
  }

  /**
   * Verifies a signed email-verification link and flips the flag.
   *
   * Idempotent by design — no consume-once tracking, so clicking an old link
   * twice (or a link already acted on) just no-ops instead of erroring, which
   * is the friendlier failure mode for an email client that prefetches links.
   */
  async verifyEmail(token: string): Promise<{ email: string }> {
    let payload: { sub: string; purpose?: string };
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: this.jwtConfiguration.secret,
        issuer: this.jwtConfiguration.issuer,
        audience: this.jwtConfiguration.audience,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired verification link');
    }
    if (payload.purpose !== EMAIL_VERIFY_PURPOSE) {
      throw new UnauthorizedException('Invalid or expired verification link');
    }
    const user = await this.usersRepository.findOneBy({ id: payload.sub });
    if (!user) {
      throw new UnauthorizedException('Invalid or expired verification link');
    }
    if (!user.isEmailVerified) {
      await this.usersRepository.update(user.id, { isEmailVerified: true });
    }
    return { email: user.email };
  }

  /** Bearer-authenticated rather than taking an email param, since under the
   * soft gate the caller is already signed in — this avoids account
   * enumeration entirely rather than just rate-limiting it. */
  async resendVerificationEmail(userId: string): Promise<{ message: string }> {
    const user = await this.usersRepository.findOneByOrFail({ id: userId });
    if (user.isEmailVerified) {
      return { message: 'Email already verified' };
    }
    const token = await this.signToken(userId, EMAIL_VERIFY_TOKEN_TTL_SECONDS, {
      purpose: EMAIL_VERIFY_PURPOSE,
    });
    await this.emailService.sendVerificationEmail(user.email, token);
    return { message: 'Verification email sent' };
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
      await this.allowlistService.assertCanAuthenticate(user.email, user);
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
      if (err instanceof UnauthorizedException) {
        throw err;
      }
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
