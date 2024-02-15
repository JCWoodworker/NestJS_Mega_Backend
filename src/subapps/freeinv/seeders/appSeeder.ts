import { LocationsService } from '../services/locations.service';
import { RoomsService } from '../services/rooms.service';
import { ItemsService } from '../services/items.service';
import { UsersService } from '../../../users/users.service';

export class FreeInvSeeder {
  constructor(
    private readonly locationsService: LocationsService,
    private readonly roomsService: RoomsService,
    private readonly itemsService: ItemsService,
    private readonly usersService: UsersService,
  ) {}
}

// TODO:
// - Seeders are going to need information from the previous seeds
// - Once users are added we need the user ids in order to add locations, rooms, and items
// - Once locations are added we need the location ids in order to add rooms
// - Once rooms are added we need the room ids in order to add items

// Order of operations:
// 1. Seed users
// 2. Get user ids
// 3. Seed locations with user ids
// 4. Get location ids
// 5. Seed rooms with location ids and user ids
// 6. Get room ids
// 7. Seed items with room ids and user ids
