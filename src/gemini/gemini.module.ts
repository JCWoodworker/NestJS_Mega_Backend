import { Module } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { GeminiController } from './gemini.controller';
@Module({
  imports: [],
  controllers: [GeminiController],
  providers: [GeminiService],
})
export class GeminiModule {}
