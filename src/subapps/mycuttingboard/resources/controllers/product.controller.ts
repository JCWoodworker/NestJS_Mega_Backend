import { UpdateProductDto } from './../../dto/update-product.dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ProductService } from '../services/product.service';
import { CreateProductDto } from '../../dto/create-product.dto';

@Controller('product')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get('')
  async getProductTestMessage() {
    return await this.productService.getTestMessage();
  }

  @Post('new')
  async addNewProduct(@Body() newProduct: CreateProductDto) {
    return await this.productService.addNewProduct(newProduct);
  }

  @Delete('delete/:id')
  async deleteProduct(@Param('id') id: number) {
    return await this.productService.deleteProduct(id);
  }

  @Patch('update/:id')
  async updateProduct(
    @Param('id') id: number,
    @Body() productUpdateData: UpdateProductDto,
  ) {
    return await this.productService.updateProduct(id, productUpdateData);
  }
}
