import { Test, TestingModule } from '@nestjs/testing';

import { GeminiController } from '@gemini/gemini.controller';
import { GeminiModule } from '@gemini/gemini.module';
import { GeminiService } from '@gemini/gemini.service';

describe('GeminiModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [GeminiModule],
    }).compile();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide the GeminiService', () => {
    const service = module.get<GeminiService>(GeminiService);
    expect(service).toBeDefined();
  });

  it('should provide the GeminiController', () => {
    const controller = module.get<GeminiController>(GeminiController);
    expect(controller).toBeDefined();
  });
});
