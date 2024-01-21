import { LocationsService } from '../resources/locations.service';
import { RoomsService } from '../resources/rooms.service';
import { ItemsService } from '../resources/items.service';

export class FreeInvSeeder {
  constructor(
    private readonly locationsService: LocationsService,
    private readonly roomsService: RoomsService,
    private readonly itemsService: ItemsService,
  ) {}
}

// TODO:
// - Seeders are going to need information from the previous seeds
// - Once users are added we need the user ids in order to add locations, rooms, and items
// - Once locations are added we need the location ids in order to add rooms
// - Once rooms are added we need the room ids in order to add items
