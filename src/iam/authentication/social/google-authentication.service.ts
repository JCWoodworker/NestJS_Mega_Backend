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

import { AuthenticationService } from '@iam/authentication/authentication.service';

@Injectable()
export class GoogleAuthenticationService implements OnModuleInit {
  private oauthClient: OAuth2Client;

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthenticationService,
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
  ) {}

  onModuleInit() {
    const clientId = this.configService.get('GOOGLE_CLIENT_ID_CBC');
    const clientSecret = this.configService.get('GOOGLE_CLIENT_SECRET_CBC');
    this.oauthClient = new OAuth2Client(clientId, clientSecret);
  }

  async authenticate(token: string) {
    try {
      const loginTicket = await this.oauthClient.verifyIdToken({
        idToken: token,
      });
      const {
        email,
        sub: googleId,
        given_name,
        family_name,
        picture,
      } = loginTicket.getPayload();
      const userNameAndImage = {
        firstName: given_name,
        lastName: family_name,
        imageUrl: picture,
      };
      const user = await this.usersRepository.findOneBy({ googleId });
      if (!user) {
        const newUser = await this.usersRepository.save({
          email,
          googleId,
          first_name: userNameAndImage.firstName,
          last_name: userNameAndImage.lastName,
          image_url: userNameAndImage.imageUrl,
          role: Role.Basic,
        });
        const userAndTokens = await this.authService.generateTokens(newUser);
        return { userAndTokens };
      }
      const userAndTokens = await this.authService.generateTokens(user);
      return { userAndTokens };
    } catch (err) {
      const pgUniqueViolationErrorCode = '23505';
      if (err.code === pgUniqueViolationErrorCode) {
        throw new ConflictException();
      }
      throw new UnauthorizedException();
    }
  }
}
