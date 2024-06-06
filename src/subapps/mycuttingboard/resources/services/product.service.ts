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
}
