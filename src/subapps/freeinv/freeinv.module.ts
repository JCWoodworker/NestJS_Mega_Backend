import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FreeinvController } from './freeinv.controller';

import { LocationsService } from './resources/locations.service';
import { RoomsService } from './resources/rooms.service';
import { ItemsService } from './resources/items.service';

import { Location } from './entities/location.entity';
import { Room } from './entities/room.entity';
import { Item } from './entities/item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Location, Room, Item])],
  controllers: [FreeinvController],
  providers: [ItemsService, LocationsService, RoomsService],
})
export class FreeinvModule {}
