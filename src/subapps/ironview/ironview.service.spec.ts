import { Test, TestingModule } from '@nestjs/testing';

import { IronviewService } from './ironview.service';

describe('IronviewService', () => {
  let service: IronviewService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IronviewService],
    }).compile();

    service = module.get<IronviewService>(IronviewService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
