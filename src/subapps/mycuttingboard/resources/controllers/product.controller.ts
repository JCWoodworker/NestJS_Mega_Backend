import { Body, Controller, Get, Post } from '@nestjs/common';
import { ProductService } from '../services/product.service';
import { CreateProductDto } from '../../dto/create-product.dto';

@Controller('product')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get('')
  async getProductTestMessage() {
    return await this.productService.getTestMessage();
  }

  @Post('new-product')
  async addNewProduct(@Body() newProduct: CreateProductDto) {
    return await this.productService.addNewProduct(newProduct);
  }
}
