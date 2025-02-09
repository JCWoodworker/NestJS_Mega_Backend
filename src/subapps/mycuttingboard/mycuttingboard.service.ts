import { Injectable } from '@nestjs/common';

// import { LinksService } from './resources/services/links.service';
// import { WoodsService } from './resources/services/woods.service';
// import { AdminService } from './resources/services/admin.service';
// import { ProductService } from './resources/services/product.service';

// import { Users } from 'src/users/entities/users.entity';

// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
// import { Role } from 'src/users/enums/role.enum';

@Injectable()
export class MycuttingboardService {
  constructor() {} // private readonly usersRepository: Repository<Users>, // @InjectRepository(Users) // private readonly productService: ProductService, // private readonly adminService: AdminService, // private readonly woodsService: WoodsService, // private readonly linksService: LinksService,

  // async userRoleSwap(userId: string, oldUserRole: string, newUserRole: string) {
  //   try {
  //     const environment = process.env.ENVIRONMENT;
  //     if (environment !== 'development' && environment !== 'preprod')
  //       return {
  //         message:
  //           'You must be in a dev or preprod environment for this feature to work',
  //       };
  //     const user = await this.usersRepository.findOne({
  //       where: { id: userId },
  //     });

  //     if (!user) {
  //       return `User with id ${userId} not found`;
  //     }

  //     user.role = newUserRole as Role;
  //     await this.usersRepository.save(user);
  //     return { message: `Successfully swapped role to ${newUserRole}` };
  //   } catch (error) {
  //     return `Failed to swap roles - ${error}`;
  //   }
  // }
}
