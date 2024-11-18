import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { OnlyBizlinksService } from './onlybizlinks.service';
import { OnlyBizlinksController } from './onlybizlinks.controller';

import { OblBusinesses } from './entities/oblBusinesses.entity';
import { OblCustomLinks } from './entities/oblCustomLinks.entity';
import { OblSocialLinks } from './entities/oblSocialLinks.entity';
import { OblUsersAndBusinesses } from './entities/oblUsersAndBusinesses.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OblBusinesses,
      OblCustomLinks,
      OblSocialLinks,
      OblUsersAndBusinesses,
    ]),
  ],
  controllers: [OnlyBizlinksController],
  providers: [OnlyBizlinksService],
})
export class OnlyBizlinksModule {}
