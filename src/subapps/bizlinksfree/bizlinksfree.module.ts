import { Module } from '@nestjs/common';
import { BizlinksfreeService } from './bizlinksfree.service';
import { BizlinksfreeController } from './bizlinksfree.controller';

@Module({
  controllers: [BizlinksfreeController],
  providers: [BizlinksfreeService],
})
export class BizlinksfreeModule {}
