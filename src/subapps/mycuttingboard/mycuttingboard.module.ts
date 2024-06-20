import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MycuttingboardController } from './mycuttingboard.controller';
import { CoastersController } from './resources/controllers/coasters.controller';
import { LinksController } from './resources/controllers/links.controller';
import { WoodsController } from './resources/controllers/woods.controller';
import { AdminController } from './resources/controllers/admin.controller';
import { ProductController } from './resources/controllers/product.controller';

import { MycuttingboardService } from './mycuttingboard.service';
import { CoastersService } from './resources/services/coasters.service';
import { LinksService } from './resources/services/links.service';
import { WoodsService } from './resources/services/woods.service';
import { AdminService } from './resources/services/admin.service';
import { ProductService } from './resources/services/product.service';

import { MycuttingboardCoasters } from './entities/mycuttingboardCoasters.entity';
import { MycuttingboardLinks } from './entities/mycuttingboardLinks.entity';
import { MycuttingboardWoods } from './entities/mycuttingboardWoods.entity';
import { CbcProduct } from './entities/cbcProducts.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MycuttingboardCoasters,
      MycuttingboardLinks,
      MycuttingboardWoods,
      CbcProduct,
    ]),
  ],
  controllers: [
    MycuttingboardController,
    CoastersController,
    LinksController,
    WoodsController,
    ProductController,
    AdminController,
  ],
  providers: [
    MycuttingboardService,
    CoastersService,
    LinksService,
    WoodsService,
    ProductService,
    AdminService,
  ],
})
export class MycuttingboardModule {}
