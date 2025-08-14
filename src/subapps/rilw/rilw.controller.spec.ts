import { Test, TestingModule } from '@nestjs/testing';
import { RilwController } from './rilw.controller';
import { RilwService } from './rilw.service';

describe('RilwController', () => {
  let controller: RilwController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RilwController],
      providers: [RilwService],
    }).compile();

    controller = module.get<RilwController>(RilwController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
