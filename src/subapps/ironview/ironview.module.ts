import { Module } from '@nestjs/common';

import { IronviewController } from './ironview.controller';
import { IronviewService } from './ironview.service';

@Module({
  controllers: [IronviewController],
  providers: [IronviewService],
})
export class IronviewModule {}
