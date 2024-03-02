import { Injectable } from '@nestjs/common';
@Injectable()
export class WoodsService {
  constructor() {}

  async getMessage() {
    return 'Hello from woods service!';
  }
}
