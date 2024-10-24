import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { OnlyBizlinksService } from './onlybizlinks.service';
import { OnlyBizlinks } from './onlybizlinks.controller';

import { OblBusinesses } from './entities/oblBusinesses.entity';
import { OblCustomLinks } from './entities/oblCustomLinks.entity';
import { OblSocialLinks } from './entities/oblSocialLinks.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([OblBusinesses, OblCustomLinks, OblSocialLinks]),
  ],
  controllers: [OnlyBizlinks],
  providers: [OnlyBizlinksService],
})
export class OnlyBizlinksModule {}
