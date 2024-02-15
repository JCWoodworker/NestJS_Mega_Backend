import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import authConfig from 'src/config/auth.config';

import { ConfigModule } from '@nestjs/config';

import { FreeinvController } from './freeinv.controller';

import { LocationsService } from './services/locations.service';
import { RoomsService } from './services/rooms.service';
import { ItemsService } from './services/items.service';

import { Locations } from './entities/location.entity';
import { Rooms } from './entities/room.entity';
import { Items } from './entities/item.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Locations, Rooms, Items]),
    ConfigModule.forFeature(authConfig),
  ],
  controllers: [FreeinvController],
  providers: [ItemsService, LocationsService, RoomsService],
})
export class FreeinvModule {}
