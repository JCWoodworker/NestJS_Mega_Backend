import { Module } from '@nestjs/common';
import { MyrestaurantlinksService } from './myrestaurantlinks.service';
import { MyrestaurantlinksController } from './myrestaurantlinks.controller';

@Module({
  controllers: [MyrestaurantlinksController],
  providers: [MyrestaurantlinksService],
})
export class MyrestaurantlinksModule {}
