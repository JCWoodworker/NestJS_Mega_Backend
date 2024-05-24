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
import { Users } from '../../../users/entities/users.entity';
import { AuthenticationService } from '../authentication.service';
import { SubappsService } from 'src/subapps/subapps.service';

@Injectable()
export class GoogleAuthenticationService implements OnModuleInit {
  private oauthClient: OAuth2Client;

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthenticationService,
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
    private readonly subappsService: SubappsService,
  ) {}

  onModuleInit() {
    const clientId = this.configService.get('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get('GOOGLE_CLIENT_SECRET');
    this.oauthClient = new OAuth2Client(clientId, clientSecret);
  }

  async authenticate(
    token: string,
    subappId: string,
    signUpOrIn: string,
    subscription_tier?: string,
  ) {
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
      if (user) {
        const userId = user.id.toString();
        const userSubappAccessExists =
          await this.subappsService.findOneByUserIdAndSubappId(
            userId,
            subappId,
          );
        if (!userSubappAccessExists && signUpOrIn === 'signup') {
          await this.subappsService.addSubappUserData(
            userId,
            subappId,
            subscription_tier,
          );
        } else if (!userSubappAccessExists && signUpOrIn === 'signin') {
          // instead, just add this app to their list of subapps they can access
          return {
            status: 403,
            message:
              'You have authenticated successfully, but you do not have access to this specific subapp.  Please sign up for this subapp first',
          };
        }
        const userAndTokens = await this.authService.generateTokens(user);
        return { userAndTokens };
      } else {
        const newUser = await this.usersRepository.save({
          email,
          googleId,
          first_name: userNameAndImage.firstName,
          last_name: userNameAndImage.lastName,
          image_url: userNameAndImage.imageUrl,
        });
        await this.subappsService.addSubappUserData(
          newUser.id,
          subappId,
          subscription_tier,
        );
        const userAndTokens = await this.authService.generateTokens(newUser);
        return { userAndTokens };
      }
    } catch (err) {
      const pgUniqueViolationErrorCode = '23505';
      if (err.code === pgUniqueViolationErrorCode) {
        throw new ConflictException();
      }
      throw new UnauthorizedException();
    }
  }
}
