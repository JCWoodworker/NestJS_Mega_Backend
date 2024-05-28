import { Controller, Get } from '@nestjs/common';
import { AdminService } from '../services/admin.service';
import { Roles } from 'src/iam/authorization/decorators/roles.decorator';
import { Role } from 'src/users/enums/role.enum';

@Roles(Role.Admin)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('test-message')
  async getTestMessage() {
    return await this.adminService.getTestMessage();
  }
}
