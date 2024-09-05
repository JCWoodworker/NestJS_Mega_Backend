import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CbcProduct } from '../../entities/cbcProducts.entity';
import { UpdateProductDto } from '../../dto/update-product.dto';
import { Users } from 'src/users/entities/users.entity';
import { filterObject } from 'src/utils/filter-object';
import { UpdateUserAndProductDto } from '../../dto/update-user-and-product.dto';
import { CreateUserAndProductDto } from '../../dto/create-user-and-product.dto';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data.interface';
import { CbcUserAndProduct } from '../../entities/cbcUserAndProduct.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(CbcProduct)
    private productRepository: Repository<CbcProduct>,
    @InjectRepository(Users)
    private userRepository: Repository<Users>,
    @InjectRepository(CbcUserAndProduct)
    private userAndProductRepository: Repository<CbcUserAndProduct>,
  ) {}

  // PRODUCT MANAGEMENT SERVICES

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

  // USER MANAGEMENT SERVICES

  async getAllUsers() {
    /* TODO
    This is returning ALL users, not just users of the CBC app
    You'll need to update the subapps logic to get
    to a point where you're only returning CBC users
    */

    const allUsers = await this.userRepository.find();
    const filteredUsers = allUsers.map((user) =>
      filterObject(user, [
        'id',
        'email',
        'role',
        'first_name',
        'last_name',
        'image_url',
      ]),
    );
    return filteredUsers;
  }

  async deleteUser(id: string) {
    try {
      const user = await this.userRepository.findOneBy({ id });
      if (!user) {
        return { message: `User with id ${id} not found` };
      }
      await this.userRepository.delete({ id });
      return { message: `Successfully deleted - ${user.email}` };
    } catch (error) {
      return { message: `Failed to delete - ${error}` };
    }
  }

  // USER-AND-PRODUCT MANAGEMENT SERVICES

  async getAllUsersAndProducts() {
    console.log('Getting all users and products is not yet implemented');

    return { message: 'This feature is not implemented yet' };
  }

  /* 
  The following implementation of getOneUserAndTheirProducts is totally unnecessary!
  THIS IS JUST A BAND AID ... quick and dirty way to achieve a goal 
  rather than a TON of refactoring.

  Instead, we should be creating relationships in the entity files they way it
  was intended with TypeORM.  We should then be creating/running migrations with 
  those relations to ensure that we can return any related data with each user.
  */
  async getOneUserAndTheirProducts(
    activeUser: ActiveUserData,
    productId: string,
  ) {
    console.log(`Active user: ${activeUser.email}, ProductId: ${productId}`);
    console.log('Getting one user and product is not yet implemented');

    return { message: 'This feature is not implemented yet' };
  }

  async addUserAndProduct(userAndProductData: CreateUserAndProductDto) {
    const product = await this.productRepository.findOneBy({
      id: userAndProductData.product_id,
    });

    if (!product) {
      return { message: 'Product not found' };
    }

    product.user_id = userAndProductData.user_id;
    await this.productRepository.save(product);
    return { message: 'User successfully added to product' };
  }

  async deleteUserAndProduct(
    userAndProductUpdateData: UpdateUserAndProductDto,
  ) {
    console.log(`UserId: ${userAndProductUpdateData.user_id}`);
    console.log(`ProductId: ${userAndProductUpdateData.product_id}`);
    console.log(`Deleting user and product data is not yet implemented`);

    return { message: 'This feature is not implemented yet' };
  }
}
