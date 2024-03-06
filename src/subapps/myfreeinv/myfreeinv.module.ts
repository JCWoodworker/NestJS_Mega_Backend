/*

We are eventually going to want to change all the entities, migrations, and DTOs to reflect a standard of using
the name of the subapp FIRST in order to show consistency and readability across all subapp data.

*/

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import authConfig from 'src/config/auth.config';

import { FreeinvController } from './myfreeinv.controller';
import { LocationsService } from './services/locations.service';
import { RoomsService } from './services/rooms.service';
import { ItemsService } from './services/items.service';
import { FreeinvService } from './myfreeinv.service';

import { MyfreeinvLocations } from './entities/location.entity';
import { MyfreeinvRooms } from './entities/room.entity';
import { MyfreeinvItems } from './entities/item.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MyfreeinvLocations,
      MyfreeinvRooms,
      MyfreeinvItems,
    ]),
    ConfigModule.forFeature(authConfig),
  ],
  controllers: [FreeinvController],
  providers: [FreeinvService, ItemsService, LocationsService, RoomsService],
})
export class MyfreeinvModule {}
