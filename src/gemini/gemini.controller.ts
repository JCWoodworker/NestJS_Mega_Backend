import { Controller, Get } from '@nestjs/common';

import { GeminiService } from './gemini.service';
@Controller()
export class GeminiController {
  constructor(private readonly geminiService: GeminiService) {}

  @Get()
  async getTestMessage() {
    return this.geminiService.getTestMessage();
  }
}
