import { Body, Controller, Get, Post } from '@nestjs/common';
import { ProductService } from '../services/product.service';

@Controller('product')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get('')
  async getProductTestMessage() {
    return await this.productService.getTestMessage();
  }

  @Post('new-product')
  async addNewProduct(@Body() newProduct: any) {
    return await this.productService.addNewProduct(newProduct);
  }
}
