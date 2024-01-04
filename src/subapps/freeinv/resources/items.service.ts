import { Injectable } from '@nestjs/common';

@Injectable()
export class ItemsService {
  findAll() {
    return `This action returns all items`;
  }
}
