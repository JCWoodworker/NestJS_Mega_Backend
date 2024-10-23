import { Test, TestingModule } from '@nestjs/testing';
import { MyrestaurantlinksController } from './myrestaurantlinks.controller';
import { MyrestaurantlinksService } from './myrestaurantlinks.service';

describe('MyrestaurantlinksController', () => {
  let controller: MyrestaurantlinksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MyrestaurantlinksController],
      providers: [MyrestaurantlinksService],
    }).compile();

    controller = module.get<MyrestaurantlinksController>(MyrestaurantlinksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
