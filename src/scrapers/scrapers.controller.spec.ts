import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ScrapersController } from './scrapers.controller';
import { ScrapersService } from './scrapers.service';

describe('ScrapersController', () => {
  let controller: ScrapersController;
  let service: ScrapersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScrapersController],
      providers: [
        {
          provide: ScrapersService,
          useValue: {
            findScraper: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ScrapersController>(ScrapersController);
    service = module.get<ScrapersService>(ScrapersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findScraper', () => {
    it('should return scraper data when valid ID is provided', async () => {
      const mockResult = {
        articles: [{ id: '1', time: '2024-03-20' }],
        isSorted: true,
      };
      jest.spyOn(service, 'findScraper').mockResolvedValue(mockResult);

      const result = await controller.findScraper('hacker-news-scraper');

      expect(result).toBe(mockResult);
      expect(service.findScraper).toHaveBeenCalledWith('hacker-news-scraper');
    });

    it('should throw NotFoundException when invalid ID is provided', async () => {
      jest
        .spyOn(service, 'findScraper')
        .mockRejectedValue(new NotFoundException());

      await expect(controller.findScraper('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
      expect(service.findScraper).toHaveBeenCalledWith('invalid-id');
    });
  });
});
