import { Module } from '@nestjs/common';
import { GeminiService } from '@gemini/gemini.service';
import { GeminiController } from '@gemini/gemini.controller';

@Module({
  imports: [],
  controllers: [GeminiController],
  providers: [GeminiService],
})
export class GeminiModule {}
