import { AdminService } from './../services/admin.service';
import {
  Controller,
  Get,
  Post,
  Body,
  Delete,
  Param,
  Patch,
} from '@nestjs/common';
import { Roles } from 'src/iam/authorization/decorators/roles.decorator';
import { Role } from 'src/users/enums/role.enum';
import { UpdateProductDto } from '../../dto/update-product.dto';
import { CreateProductDto } from '../../dto/create-product.dto';
import { CreateUserAndProductDto } from '../../dto/create-user-and-product.dto';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data.interface';

@Roles(Role.Admin)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // PRODUCT MANAGEMENT ENDPOINTS

  @Get('all-product-data')
  async getAllProductData() {
    return await this.adminService.getAllProductData();
  }

  @Post('add-new-product')
  async addNewProduct(@Body() newProduct: CreateProductDto) {
    return await this.adminService.addNewProduct(newProduct);
  }

  @Patch('update-product/:id')
  async updateProduct(
    @Param('id') id: number,
    @Body() productUpdateData: UpdateProductDto,
  ) {
    return await this.adminService.updateProduct(id, productUpdateData);
  }

  @Delete('delete-product/:id')
  async deleteProduct(@Param('id') id: number) {
    return await this.adminService.deleteProduct(id);
  }

  // USER MANAGEMENT ENDPOINTS

  @Get('all-users')
  async getAllUsers() {
    return await this.adminService.getAllUsers();
  }

  @Delete('delete-user/:userId')
  async deleteUser(@Param('userId') id: string) {
    const decodedUserId = decodeURIComponent(id);
    return await this.adminService.deleteUser(decodedUserId);
  }

  // USER-AND-PRODUCT MANAGEMENT ENDPOINTS

  @Get('user-and-product/single-user-product-list/:userId')
  async getAllUsersAndProducts() {
    return await this.adminService.getAllUsersAndProducts();
  }

  @Roles(Role.Admin, Role.Basic)
  @Get('user-and-product/:productId')
  async getOneUserAndProduct(
    @ActiveUser() activeUser: ActiveUserData,
    @Param('productId') productId: string,
  ) {
    return await this.adminService.getOneUserAndProduct(activeUser, productId);
  }

  @Post('user-and-product/add')
  async addUserAndProduct(
    @Body() newUserAndProductData: CreateUserAndProductDto,
  ) {
    return await this.adminService.addUserAndProduct(newUserAndProductData);
  }

  @Delete('user-and-product/delete/:userId:productId')
  async deleteUserAndProduct(
    @Param('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    return await this.adminService.deleteUserAndProduct({
      user_id: userId,
      product_id: productId,
    });
  }
}
