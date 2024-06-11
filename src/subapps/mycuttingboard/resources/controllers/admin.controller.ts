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

@Roles(Role.Admin)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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
}
