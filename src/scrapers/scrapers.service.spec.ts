import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ScrapersService } from './scrapers.service';
import { scrapeHackerNews } from './utils/hackerNewsScraper';

jest.mock('./utils/hackerNewsScraper');

describe('ScrapersService', () => {
  let service: ScrapersService;
  const mockScrapedData = {
    articles: [
      { id: '1', time: '2024-04-03 10:00:00' },
      { id: '2', time: '2024-04-03 09:00:00' },
    ],
    isSorted: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScrapersService],
    }).compile();

    service = module.get<ScrapersService>(ScrapersService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findScraper', () => {
    it('should return scraped data for hacker-news-scraper', async () => {
      (scrapeHackerNews as jest.Mock).mockResolvedValue(mockScrapedData);

      const result = await service.findScraper('hacker-news-scraper');

      expect(result).toEqual(mockScrapedData);
      expect(scrapeHackerNews).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException for unknown scraper id', async () => {
      await expect(service.findScraper('unknown-scraper')).rejects.toThrow(
        new NotFoundException('Scraper with ID "unknown-scraper" not found'),
      );

      expect(scrapeHackerNews).not.toHaveBeenCalled();
    });

    it('should propagate errors from scrapeHackerNews', async () => {
      const error = new Error('Scraping failed');
      (scrapeHackerNews as jest.Mock).mockRejectedValue(error);

      await expect(service.findScraper('hacker-news-scraper')).rejects.toThrow(
        error,
      );

      expect(scrapeHackerNews).toHaveBeenCalledTimes(1);
    });
  });
});
