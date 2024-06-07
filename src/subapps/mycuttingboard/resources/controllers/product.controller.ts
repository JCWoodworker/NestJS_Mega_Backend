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

  @Get('all')
  async getAllProducts() {
    return await this.productService.getAllProducts();
  }

  @Get(':id')
  async getProductById(@Param('id') id: number) {
    return await this.productService.getProductById(id);
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
