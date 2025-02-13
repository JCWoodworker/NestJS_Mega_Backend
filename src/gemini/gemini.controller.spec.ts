import { Test, TestingModule } from '@nestjs/testing';
import { GeminiController } from '@gemini/gemini.controller';
import { GeminiService } from '@gemini/gemini.service';

describe('GeminiController', () => {
  let controller: GeminiController;
  let service: GeminiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GeminiController],
      providers: [
        {
          provide: GeminiService,
          useValue: {
            getTestMessage: jest.fn(),
            sendGeminiPrompt: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<GeminiController>(GeminiController);
    service = module.get<GeminiService>(GeminiService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return a test message on a get request', async () => {
    const result = 'This action returns all gemini';
    jest.spyOn(service, 'getTestMessage').mockResolvedValue(result);

    expect(await controller.getTestMessage()).toBe(result);
  });

  it('should return a test response on a post request', async () => {
    const result = 'This is a test response to your prompt: test';
    jest.spyOn(service, 'sendGeminiPrompt').mockResolvedValue(result);
    expect(await controller.sendGeminiPrompt({ prompt: 'test' })).toBe(result);
  });
});
