import { Module } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { GeminiController } from './gemini.controller';

import { ConfigModule } from '@nestjs/config';
import authConfig from 'src/config/auth.config';

@Module({
  imports: [ConfigModule.forFeature(authConfig)],
  controllers: [GeminiController],
  providers: [GeminiService],
})
export class GeminiModule {}
