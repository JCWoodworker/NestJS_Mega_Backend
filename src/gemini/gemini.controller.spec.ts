import { Test, TestingModule } from '@nestjs/testing';
import { GeminiController } from './gemini.controller';
import { GeminiService } from './gemini.service';

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

  it('should return a test message', async () => {
    const result = 'This action returns all gemini';
    jest.spyOn(service, 'getTestMessage').mockResolvedValue(result);

    expect(await controller.getTestMessage()).toBe(result);
  });
});
