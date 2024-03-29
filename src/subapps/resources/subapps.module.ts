import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MyfreeinvModule } from '../myfreeinv/myfreeinv.module';
import { BizlinksfreeModule } from '../bizlinksfree/bizlinksfree.module';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SubappsService } from './subapps.service';
import { SubappsController } from './subapps.controller';

import { UserSubappAccess } from './entities/userSubappAccess.entity';

import authConfig from 'src/config/auth.config';
import { MycuttingboardModule } from '../mycuttingboard/mycuttingboard.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserSubappAccess]),
    ConfigModule.forFeature(authConfig),
    MyfreeinvModule,
    BizlinksfreeModule,
    MycuttingboardModule,
  ],
  controllers: [SubappsController],
  providers: [SubappsService],
})
export class SubappsModule {}
