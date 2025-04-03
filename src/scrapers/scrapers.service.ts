import { Injectable, NotFoundException } from '@nestjs/common';

import { scrapeHackerNews } from './utils/hackerNewsScraper';

@Injectable()
export class ScrapersService {
  async findScraper(id: string): Promise<any> {
    if (id === 'hacker-news-scraper') {
      return scrapeHackerNews();
    }
    throw new NotFoundException(`Scraper with ID "${id}" not found`);
  }
}
