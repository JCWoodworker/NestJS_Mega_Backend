import { Test, TestingModule } from '@nestjs/testing';
import { MyrestaurantlinksService } from './myrestaurantlinks.service';

describe('MyrestaurantlinksService', () => {
  let service: MyrestaurantlinksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MyrestaurantlinksService],
    }).compile();

    service = module.get<MyrestaurantlinksService>(MyrestaurantlinksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
