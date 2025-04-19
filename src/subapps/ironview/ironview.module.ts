import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AreaType } from './entities/area-type.entity';
import { Area } from './entities/area.entity';
import { Building } from './entities/building.entity';
import { Floor } from './entities/floor.entity';
import { Room } from './entities/room.entity';
import { WallImage } from './entities/wall-image.entity';
import { Wall } from './entities/wall.entity';
import { IronviewController } from './ironview.controller';
import { IronviewService } from './ironview.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Building,
      Floor,
      Room,
      Area,
      AreaType,
      Wall,
      WallImage,
    ]),
  ],
  controllers: [IronviewController],
  providers: [IronviewService],
})
export class IronviewModule {}
