import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Referral } from './entities/referral.entity';
import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';

@Module({
  imports: [TypeOrmModule.forFeature([Referral])],
  controllers: [ReferralController],
  providers: [ReferralService],
})
export class MywoodappModule {}
