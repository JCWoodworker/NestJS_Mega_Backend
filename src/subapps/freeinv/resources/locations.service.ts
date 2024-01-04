import { Injectable } from '@nestjs/common';

@Injectable()
export class LocationsService {
  findAll() {
    return `This action returns all locations`;
  }
}
