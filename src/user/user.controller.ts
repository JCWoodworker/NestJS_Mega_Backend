import {
  Controller,
  Get,
  // Post,
  // Body,
  // Patch,
  // Param,
  // Delete,
} from '@nestjs/common';
import { UserService } from './user.service';
import { SkipAuth } from 'src/auth/decorators/skipAuth.decorator';
// import { CreateUserDto } from './dto/create-user.dto';
// import { UpdateUserDto } from './dto/update-user.dto';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // remember to get the fuck rid of this ... just testing SkipAuth
  @SkipAuth()
  @Get('getallusers')
  findAll() {
    return this.userService.findAll();
  }
}
