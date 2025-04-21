import { Test, TestingModule } from '@nestjs/testing';

import { IronviewController } from './ironview.controller';
import { IronviewService } from './ironview.service';

describe('IronviewController', () => {
  let controller: IronviewController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IronviewController],
      providers: [IronviewService],
    }).compile();

    controller = module.get<IronviewController>(IronviewController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
