import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getIntroMessage(): string {
    return `<h1>Welcome to James' NestJS Api!</h1><p>This is a boilerplate for a NestJS API with JWT authentication and PostgreSQL database integration.</p>`;
  }
}
