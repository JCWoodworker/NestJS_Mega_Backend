import { Injectable } from '@nestjs/common';
@Injectable()
export class LinksService {
  async getMessage() {
    return 'Hello from links service!';
  }
}
