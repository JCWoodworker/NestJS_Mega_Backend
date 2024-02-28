import { Injectable } from '@nestjs/common';
@Injectable()
export class BoardsService {
  constructor() {}

  async getMessage() {
    return 'Hello from boards service!';
  }
}
