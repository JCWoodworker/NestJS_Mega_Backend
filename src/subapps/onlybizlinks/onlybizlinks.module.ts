import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OblBusinesses } from './entities/oblBusinesses.entity';
import { OblCustomLinks } from './entities/oblCustomLinks.entity';
import { OblSocialLinks } from './entities/oblSocialLinks.entity';
import { OblUsersAndBusinesses } from './entities/oblUsersAndBusinesses.entity';
import { OnlyBizlinksController } from './onlybizlinks.controller';
import { OnlyBizlinksService } from './onlybizlinks.service';

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
