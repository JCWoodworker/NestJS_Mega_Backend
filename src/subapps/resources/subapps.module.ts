import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SubappsService } from './subapps.service';
import { SubappsController } from './subapps.controller';
import { FreeinvModule } from '../freeinv/freeinv.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSubappAccess } from './entities/userSubappAccess.entity';
import authConfig from 'src/config/auth.config';

@Module({
  controllers: [SubappsController],
  providers: [SubappsService],
  imports: [
    TypeOrmModule.forFeature([UserSubappAccess]),
    ConfigModule.forFeature(authConfig),
    FreeinvModule,
  ],
})
export class SubappsModule {}
