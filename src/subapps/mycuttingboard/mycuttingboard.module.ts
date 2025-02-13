import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Users } from '@users/entities/users.entity';

import { CbcLinks } from '@mycuttingboard/entities/cbcLinks.entity';
import { CbcProduct } from '@mycuttingboard/entities/cbcProducts.entity';
import { CbcUserAndProduct } from '@mycuttingboard/entities/cbcUserAndProduct.entity';
import { MycuttingboardWoods } from '@mycuttingboard/entities/mycuttingboardWoods.entity';
import { MycuttingboardController } from '@mycuttingboard/mycuttingboard.controller';
import { MycuttingboardService } from '@mycuttingboard/mycuttingboard.service';
import { AdminController } from '@mycuttingboard/resources/controllers/admin.controller';
import { LinksController } from '@mycuttingboard/resources/controllers/links.controller';
import { ProductController } from '@mycuttingboard/resources/controllers/product.controller';
import { WoodsController } from '@mycuttingboard/resources/controllers/woods.controller';
import { AdminService } from '@mycuttingboard/resources/services/admin.service';
import { LinksService } from '@mycuttingboard/resources/services/links.service';
import { ProductService } from '@mycuttingboard/resources/services/product.service';
import { WoodsService } from '@mycuttingboard/resources/services/woods.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Users,
      CbcLinks,
      MycuttingboardWoods,
      CbcProduct,
      CbcUserAndProduct,
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
