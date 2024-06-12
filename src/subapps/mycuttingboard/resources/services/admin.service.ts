import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CbcProduct } from '../../entities/cbcProducts.entity';
import { UpdateProductDto } from '../../dto/update-product.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(CbcProduct)
    private productRepository: Repository<CbcProduct>,
  ) {}

  async getAllProductData() {
    return await this.productRepository.find();
  }

  async addNewProduct(newProduct) {
    try {
      await this.productRepository.save(newProduct);
      return { message: 'Product added successfully', product: newProduct };
    } catch (error) {
      return error;
    }
  }

  async updateProduct(id: number, productUpdateData: UpdateProductDto) {
    const product = await this.productRepository.findOneBy({ id });
    return await this.productRepository.save({
      ...product,
      ...productUpdateData,
    });
  }

  async deleteProduct(id: number) {
    try {
      const product = await this.productRepository.findOneBy({ id });
      if (!product) {
        return { message: `Product with id ${id} not found` };
      }
      await this.productRepository.delete({ id });
      return { message: `Successfully deleted - ${product.title}` };
    } catch (error) {
      return { message: `Failed to delete - ${error}` };
    }
  }
}
