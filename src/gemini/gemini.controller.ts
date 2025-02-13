import { Body, Controller, Get, Post } from '@nestjs/common';

import { GeminiService } from '@gemini/gemini.service';
import { CreateGeminiPromptDto } from '@gemini/dto/create-gemini-prompt.dto';
@Controller()
export class GeminiController {
  constructor(private readonly geminiService: GeminiService) {}

  @Get()
  async getTestMessage() {
    return this.geminiService.getTestMessage();
  }

  @Post('send-gemini-prompt')
  async sendGeminiPrompt(@Body() body: CreateGeminiPromptDto) {
    return this.geminiService.sendGeminiPrompt(body.prompt);
  }
}
