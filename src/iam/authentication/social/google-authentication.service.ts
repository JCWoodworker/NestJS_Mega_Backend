import {
  ConflictException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { OAuth2Client } from 'google-auth-library';
import { Repository } from 'typeorm';

import { Users } from '@users/entities/users.entity';
import { Role } from '@users/enums/role.enum';

import { AuthAllowlistService } from '@iam/authentication/auth-allowlist.service';
import { AuthenticationService } from '@iam/authentication/authentication.service';

@Injectable()
export class GoogleAuthenticationService implements OnModuleInit {
  private oauthClient: OAuth2Client;
  /** Google OAuth client IDs whose ID tokens this backend will accept. */
  private allowedAudiences: string[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthenticationService,
    private readonly allowlistService: AuthAllowlistService,
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
  ) {}

  onModuleInit() {
    const clientId = this.configService.get('GOOGLE_CLIENT_ID_CBC');
    const clientSecret = this.configService.get('GOOGLE_CLIENT_SECRET_CBC');
    this.oauthClient = new OAuth2Client(clientId, clientSecret);

    // This backend serves several frontends, each with its own Google OAuth
    // client, so verification has to accept a set of audiences rather than
    // one. Unset values are filtered out so a missing env var narrows the
    // set instead of allowing `undefined` through.
    this.allowedAudiences = [
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_ID_CBC'),
    ].filter((id): id is string => !!id?.trim());
  }

  async authenticate(token: string) {
    try {
      // `audience` is mandatory here, not optional hardening. Without it
      // google-auth-library verifies only the signature and issuer — so an ID
      // token minted for *any* Google OAuth client anywhere would be accepted
      // as a sign-in to this backend. With accounts now connecting real
      // brokerage credentials, that is the difference between "Google says
      // this person owns this email" and "Google says this token is valid for
      // someone else's app".
      if (!this.allowedAudiences.length) {
        throw new UnauthorizedException(
          'Google sign-in is not configured on this deployment',
        );
      }

      const loginTicket = await this.oauthClient.verifyIdToken({
        idToken: token,
        audience: this.allowedAudiences,
      });
      const {
        email,
        sub: googleId,
        given_name,
        family_name,
        picture,
      } = loginTicket.getPayload();
      const normalizedEmail = this.allowlistService.normalizeEmail(email);
      const userNameAndImage = {
        firstName: given_name,
        lastName: family_name,
        imageUrl: picture,
      };
      const user = await this.usersRepository.findOneBy({ googleId });
      if (!user) {
        await this.allowlistService.assertCanAuthenticate(normalizedEmail);

        // Link rather than insert when the email already has an account.
        // Signing up with a password and later clicking "Continue with
        // Google" is a normal thing to do, and it previously hit the unique
        // email constraint and surfaced as an opaque 409. Google has verified
        // ownership of this address, so attaching the googleId is safe and is
        // what the user expects.
        const existingByEmail = await this.usersRepository.findOneBy({
          email: normalizedEmail,
        });
        if (existingByEmail) {
          await this.allowlistService.assertCanAuthenticate(
            existingByEmail.email,
            existingByEmail,
          );
          existingByEmail.googleId = googleId;
          existingByEmail.first_name ??= userNameAndImage.firstName;
          existingByEmail.last_name ??= userNameAndImage.lastName;
          existingByEmail.image_url ??= userNameAndImage.imageUrl;
          const linked = await this.usersRepository.save(existingByEmail);
          const userAndTokens = await this.authService.generateTokens(linked);
          return { userAndTokens };
        }

        const newUser = await this.usersRepository.save({
          email: normalizedEmail,
          googleId,
          first_name: userNameAndImage.firstName,
          last_name: userNameAndImage.lastName,
          image_url: userNameAndImage.imageUrl,
          role: Role.Basic,
        });
        const userAndTokens = await this.authService.generateTokens(newUser);
        return { userAndTokens };
      }
      await this.allowlistService.assertCanAuthenticate(user.email, user);
      const userAndTokens = await this.authService.generateTokens(user);
      return { userAndTokens };
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      const pgUniqueViolationErrorCode = '23505';
      if (err.code === pgUniqueViolationErrorCode) {
        throw new ConflictException();
      }
      throw new UnauthorizedException();
    }
  }
}
