import { format } from 'date-fns';
import { chromium } from 'playwright';

interface HackerNewsArticle {
  position: number;
  title: string;
  id: string;
  time: string;
  url: string;
}

export async function scrapeHackerNews(): Promise<{
  articles: HackerNewsArticle[];
  isSorted: boolean;
}> {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    let allArticles: HackerNewsArticle[] = [];
    let nextParam: string | null = null;

    while (allArticles.length < 100) {
      const url = nextParam
        ? `https://news.ycombinator.com/${nextParam}`
        : 'https://news.ycombinator.com/newest';

      await page.goto(url);

      const currentPageArticles = await page.$$eval(
        '.submission',
        (elements: Element[], startIndex: number) => {
          return elements.map((article, index) => {
            const rawTime = article
              .nextElementSibling!.querySelector('.age')!
              .getAttribute('title');
            const articleTitle = article.querySelector('.titleline > a')!;

            return {
              position: startIndex + index + 1,
              title: articleTitle.textContent!,
              id: article.getAttribute('id')!,
              time: rawTime!,
              url: articleTitle.getAttribute('href')!,
            };
          });
        },
        allArticles.length,
      );

      const formattedArticles = currentPageArticles.map((article) => {
        try {
          const isoDatePart = article.time.split(' ')[0];
          return {
            ...article,
            time: format(new Date(isoDatePart), "MMMM do, yyyy '@' h:mm:ssaaa"),
          };
        } catch (error) {
          console.error('Error formatting date:', error);
          return article;
        }
      });

      allArticles = [...allArticles, ...formattedArticles];

      const linkToNextPage = await page.$eval('a.morelink', (moreLink) =>
        moreLink.getAttribute('href'),
      );
      if (linkToNextPage) {
        nextParam = linkToNextPage;
      } else {
        break;
      }
    }

    allArticles = allArticles.slice(0, 100);

    let isSorted = true;
    for (let i = 1; i < allArticles.length; i++) {
      const prevTime = new Date(allArticles[i - 1].time);
      const currTime = new Date(allArticles[i].time);
      if (prevTime < currTime) {
        isSorted = false;
        break;
      }
    }

    return {
      articles: allArticles,
      isSorted,
    };
  } catch (error: any) {
    throw new Error(`Failed to scrape Hacker News: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
