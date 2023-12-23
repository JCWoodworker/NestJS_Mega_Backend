import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getIntroMessage(): any {
    return { message: 'Hello World!' };
  }
}
