import { Injectable } from '@nestjs/common';

@Injectable()
export class GeminiService {
  async getTestMessage() {
    return `This action returns all gemini`;
  }
}
