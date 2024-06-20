import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CbcProduct } from '../../entities/cbcProducts.entity';
import { UpdateProductDto } from '../../dto/update-product.dto';
import { Users } from 'src/users/entities/users.entity';
import { filterObject } from 'src/utils/filter-object';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(CbcProduct)
    private productRepository: Repository<CbcProduct>,
    @InjectRepository(Users)
    private userRepository: Repository<Users>,
  ) {}

  async getAllProductData() {
    return await this.productRepository.find();
  }

  async addNewProduct(newProduct) {
    try {
      await this.productRepository.save(newProduct);
      return { message: 'Product added successfully', product: newProduct };
    } catch (error) {
      return error.detail;
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

  async getAllUsers() {
    // This is returning ALL users, not just users of the CBC app
    // You'll need to update the subapps logic to get
    // to a point where you're only returning CBC users
    const allUsers = await this.userRepository.find();
    const filteredUsers = allUsers.map((user) =>
      filterObject(user, [
        'id',
        'email',
        'first_name',
        'last_name',
        'image_url',
      ]),
    );
    return filteredUsers;
  }
}
