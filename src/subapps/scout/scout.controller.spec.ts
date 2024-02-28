import { Test, TestingModule } from '@nestjs/testing';
import { ScoutController } from './scout.controller';
import { ScoutService } from './scout.service';

describe('ScoutController', () => {
  let controller: ScoutController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScoutController],
      providers: [ScoutService],
    }).compile();

    controller = module.get<ScoutController>(ScoutController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
