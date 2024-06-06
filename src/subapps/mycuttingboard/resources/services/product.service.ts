import { UpdateProductDto } from './../../dto/update-product.dto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CbcProduct } from '../../entities/cbcProducts.entity';
@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(CbcProduct)
    private readonly cbcProductRepository: Repository<CbcProduct>,
  ) {}
  async getTestMessage() {
    return 'Hello from the Product service!';
  }

  async addNewProduct(newProduct) {
    return await this.cbcProductRepository.save(newProduct);
  }

  async deleteProduct(id: number) {
    try {
      const product = await this.cbcProductRepository.findOneBy({ id });
      if (!product) {
        return { message: `Product with id ${id} not found` };
      }
      await this.cbcProductRepository.delete({ id });
      return { message: `Successfully deleted - ${product.title}` };
    } catch (error) {
      return { message: `Failed to delete ${error}` };
    }
  }

  async updateProduct(id: number, productUpdateData: UpdateProductDto) {
    const product = await this.cbcProductRepository.findOneBy({ id });
    return await this.cbcProductRepository.save({
      ...product,
      ...productUpdateData,
    });
  }
}
