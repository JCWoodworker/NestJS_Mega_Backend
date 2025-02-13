import { Module } from '@nestjs/common';

import { GeminiController } from '@gemini/gemini.controller';
import { GeminiService } from '@gemini/gemini.service';

@Module({
  imports: [],
  controllers: [GeminiController],
  providers: [GeminiService],
})
export class GeminiModule {}
