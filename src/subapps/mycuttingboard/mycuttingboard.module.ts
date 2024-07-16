import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MycuttingboardController } from './mycuttingboard.controller';
import { LinksController } from './resources/controllers/links.controller';
import { WoodsController } from './resources/controllers/woods.controller';
import { AdminController } from './resources/controllers/admin.controller';
import { ProductController } from './resources/controllers/product.controller';

import { MycuttingboardService } from './mycuttingboard.service';
import { LinksService } from './resources/services/links.service';
import { WoodsService } from './resources/services/woods.service';
import { AdminService } from './resources/services/admin.service';
import { ProductService } from './resources/services/product.service';

import { CbcLinks } from './entities/cbcLinks.entity';
import { MycuttingboardWoods } from './entities/mycuttingboardWoods.entity';
import { CbcProduct } from './entities/cbcProducts.entity';
import { Users } from 'src/users/entities/users.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Users,
      CbcLinks,
      MycuttingboardWoods,
      CbcProduct,
    ]),
  ],
  controllers: [
    MycuttingboardController,
    LinksController,
    WoodsController,
    ProductController,
    AdminController,
  ],
  providers: [
    MycuttingboardService,
    LinksService,
    WoodsService,
    ProductService,
    AdminService,
  ],
})
export class MycuttingboardModule {}
