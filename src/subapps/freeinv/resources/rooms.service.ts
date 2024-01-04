import { Injectable } from '@nestjs/common';

@Injectable()
export class RoomsService {
  findAll() {
    return `This action returns all rooms`;
  }
}
