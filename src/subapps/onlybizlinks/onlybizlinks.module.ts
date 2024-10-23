import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { OnlyBizlinksService } from './onlybizlinks.service';
import { OnlyBizlinks } from './onlybizlinks.controller';

import { MrlRestaurants } from './entities/mrlRestaurants.entity';
import { MrlCustomLinks } from './entities/mrlCustomLinks.entity';
import { MrlSocialLinks } from './entities/mrlSocialLinks.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([MrlRestaurants, MrlCustomLinks, MrlSocialLinks]),
  ],
  controllers: [OnlyBizlinks],
  providers: [OnlyBizlinksService],
})
export class OnlyBizlinksModule {}
