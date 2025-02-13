import { Test, TestingModule } from '@nestjs/testing';

import { GeminiService } from '@gemini/gemini.service';

describe('GeminiService', () => {
  let service: GeminiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GeminiService],
    }).compile();

    service = module.get<GeminiService>(GeminiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return a test message', async () => {
    const result = 'This action returns all gemini';
    expect(await service.getTestMessage()).toBe(result);
  });

  it('should return a response to the prompt', async () => {
    const result =
      'This is a response to your prompt.  You sent the following: "test"';
    expect(await service.sendGeminiPrompt('test')).toBe(result);
  });
});
