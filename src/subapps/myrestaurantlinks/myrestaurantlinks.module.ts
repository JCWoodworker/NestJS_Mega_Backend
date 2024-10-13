import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { MyrestaurantlinksService } from './myrestaurantlinks.service';
import { MyrestaurantlinksController } from './myrestaurantlinks.controller';

import { MrlRestaurants } from './entities/mrlRestaurants.entity';
import { MrlCustomLinks } from './entities/mrlCustomLinks.entity';
import { MrlSocialLinks } from './entities/mrlSocialLinks.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([MrlRestaurants, MrlCustomLinks, MrlSocialLinks]),
  ],
  controllers: [MyrestaurantlinksController],
  providers: [MyrestaurantlinksService],
})
export class MyrestaurantlinksModule {}
