import { Controller, Get } from '@nestjs/common';
import { ProductService } from '../services/product.service';

@Controller('links')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get('')
  async getProductTestMessage() {
    return await this.productService.getTestMessage();
  }
}
