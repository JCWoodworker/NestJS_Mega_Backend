import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { MyrestaurantlinksService } from './myrestaurantlinks.service';
import { MyrestaurantlinksController } from './myrestaurantlinks.controller';
import { MrlRestaurants } from './entities/mrlRestaurants.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MrlRestaurants])],
  controllers: [MyrestaurantlinksController],
  providers: [MyrestaurantlinksService],
})
export class MyrestaurantlinksModule {}
