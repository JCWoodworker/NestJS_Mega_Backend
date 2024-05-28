import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import authConfig from 'src/config/auth.config';

import { BizlinksfreeModule } from './bizlinksfree/bizlinksfree.module';
import { MyfreeinvModule } from './myfreeinv/myfreeinv.module';
import { MycuttingboardModule } from './mycuttingboard/mycuttingboard.module';

import { SubappsService } from './subapps.service';
import { SubappsController } from './subapps.controller';
import { UserSubappAccess } from './resources/entities/userSubappAccess.entity';

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
