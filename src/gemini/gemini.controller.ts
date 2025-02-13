import { Body, Controller, Get, Post } from '@nestjs/common';

import { GeminiService } from './gemini.service';

interface SendGeminiPromptBody {
  prompt: string;
}

@Controller()
export class GeminiController {
  constructor(private readonly geminiService: GeminiService) {}

  @Get()
  async getTestMessage() {
    return this.geminiService.getTestMessage();
  }

  @Post('send-gemini-prompt')
  async sendGeminiPrompt(@Body() body: SendGeminiPromptBody) {
    return this.geminiService.sendGeminiPrompt(body.prompt);
  }
}
