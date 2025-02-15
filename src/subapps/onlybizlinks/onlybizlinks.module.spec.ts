import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { OblBusinesses } from './entities/oblBusinesses.entity';
import { OblCustomLinks } from './entities/oblCustomLinks.entity';
import { OblSocialLinks } from './entities/oblSocialLinks.entity';
import { OblUsersAndBusinesses } from './entities/oblUsersAndBusinesses.entity';
import { OnlyBizlinksController } from './onlybizlinks.controller';
import { OnlyBizlinksModule } from './onlybizlinks.module';
import { OnlyBizlinksService } from './onlybizlinks.service';

describe('OnlyBizlinksModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [OnlyBizlinksModule],
    })
      .overrideProvider(getRepositoryToken(OblBusinesses))
      .useValue({})
      .overrideProvider(getRepositoryToken(OblCustomLinks))
      .useValue({})
      .overrideProvider(getRepositoryToken(OblSocialLinks))
      .useValue({})
      .overrideProvider(getRepositoryToken(OblUsersAndBusinesses))
      .useValue({})
      .compile();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should have OnlyBizlinksController', () => {
    const controller = module.get<OnlyBizlinksController>(
      OnlyBizlinksController,
    );
    expect(controller).toBeDefined();
  });

  it('should have OnlyBizlinksService', () => {
    const service = module.get<OnlyBizlinksService>(OnlyBizlinksService);
    expect(service).toBeDefined();
  });

  it('should have all required repositories', () => {
    const businessesRepo = module.get(getRepositoryToken(OblBusinesses));
    const customLinksRepo = module.get(getRepositoryToken(OblCustomLinks));
    const socialLinksRepo = module.get(getRepositoryToken(OblSocialLinks));
    const usersAndBusinessesRepo = module.get(
      getRepositoryToken(OblUsersAndBusinesses),
    );

    expect(businessesRepo).toBeDefined();
    expect(customLinksRepo).toBeDefined();
    expect(socialLinksRepo).toBeDefined();
    expect(usersAndBusinessesRepo).toBeDefined();
  });
});
