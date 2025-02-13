import { Test, TestingModule } from '@nestjs/testing';
import { GeminiController } from '@gemini/gemini.controller';
import { GeminiService } from '@gemini/gemini.service';
import { CreateGeminiPromptDto } from '@gemini/dto/create-gemini-prompt.dto';

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

  describe('getTestMessage', () => {
    it('should return a test message on a get request', async () => {
      const result = 'This action returns all gemini';
      jest.spyOn(service, 'getTestMessage').mockResolvedValue(result);

      expect(await controller.getTestMessage()).toBe(result);
    });
  });

  describe('sendGeminiPrompt', () => {
    it('should return a test response on a post request', async () => {
      const result = 'This is a test response to your prompt: test';
      const dto = new CreateGeminiPromptDto();
      dto.prompt = 'test';

      jest.spyOn(service, 'sendGeminiPrompt').mockResolvedValue(result);
      expect(await controller.sendGeminiPrompt(dto)).toBe(result);
    });
  });
});
