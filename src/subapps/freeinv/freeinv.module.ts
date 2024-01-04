import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import authConfig from 'src/config/auth.config';

import { FreeinvController } from './freeinv.controller';

import { LocationsService } from './resources/locations.service';
import { RoomsService } from './resources/rooms.service';
import { ItemsService } from './resources/items.service';

import { Locations } from './entities/location.entity';
import { Rooms } from './entities/room.entity';
import { Items } from './entities/item.entity';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([Locations, Rooms, Items]),
    ConfigModule.forFeature(authConfig),
  ],
  controllers: [FreeinvController],
  providers: [ItemsService, LocationsService, RoomsService],
})
export class FreeinvModule {}
