import { Test, TestingModule } from '@nestjs/testing';
import { RilwService } from './rilw.service';

describe('RilwService', () => {
  let service: RilwService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RilwService],
    }).compile();

    service = module.get<RilwService>(RilwService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
