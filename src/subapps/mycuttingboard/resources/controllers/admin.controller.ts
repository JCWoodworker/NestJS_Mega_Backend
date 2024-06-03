import { Controller, Get, Post, Body, Delete, Param } from '@nestjs/common';
import { AdminService } from '../services/admin.service';
import { Roles } from 'src/iam/authorization/decorators/roles.decorator';
import { Role } from 'src/users/enums/role.enum';
import { MycuttingboardBoards } from '../../entities/mycuttingboardBoards.entity';
import { MycuttingboardCoasters } from '../../entities/mycuttingboardCoasters.entity';

type NewProductType = {
  category: string;
  newProduct: MycuttingboardBoards | MycuttingboardCoasters;
};

@Roles(Role.Admin)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('test-message')
  async getTestMessage() {
    return await this.adminService.getTestMessage();
  }

  @Get('all-product-data')
  async getAllProductData() {
    return await this.adminService.getAllProductData();
  }

  @Post('add-new-product')
  async addNewProduct(@Body() newProduct: NewProductType) {
    return await this.adminService.addNewProduct(newProduct);
  }

  @Delete('delete-product/:id/:category')
  async deleteProduct(
    @Param('id') id: number,
    @Param('category') category: string,
  ) {
    return await this.adminService.deleteProduct(id, category);
  }
}
