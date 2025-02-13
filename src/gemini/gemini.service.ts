import { Injectable } from '@nestjs/common';

@Injectable()
export class GeminiService {
  async getTestMessage() {
    return `This action returns all gemini`;
  }

  async sendGeminiPrompt(prompt: string) {
    return `This is a response to your prompt.  You sent the following: "${prompt}"`;
  }
}
