import { Injectable } from '@nestjs/common';

import { ItemsService } from './services/items.service';
import { RoomsService } from './services/rooms.service';
import { LocationsService } from './services/locations.service';

@Injectable()
export class FreeinvService {
  constructor(
    private readonly itemsService: ItemsService,
    private readonly locationsService: LocationsService,
    private readonly roomsService: RoomsService,
  ) {}

  async testingMessage() {
    return 'test hello';
  }
}
