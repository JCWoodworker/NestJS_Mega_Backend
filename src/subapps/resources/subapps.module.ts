import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FreeinvModule } from '../freeinv/freeinv.module';
import { BizlinksfreeModule } from '../bizlinksfree/bizlinksfree.module';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SubappsService } from './subapps.service';
import { SubappsController } from './subapps.controller';

import { UserSubappAccess } from './entities/userSubappAccess.entity';

import authConfig from 'src/config/auth.config';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserSubappAccess]),
    ConfigModule.forFeature(authConfig),
    FreeinvModule,
    BizlinksfreeModule,
  ],
  controllers: [SubappsController],
  providers: [SubappsService],
})
export class SubappsModule {}
