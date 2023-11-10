import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { SkipAuth } from 'src/auth/decorators/skipAuth.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SerializedUserDto } from './dto/serialezed-user';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UsersService) {}

  @Get('getallusers')
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  async findOneById(
    @Param('id') id: number,
    @Req() req,
  ): Promise<SerializedUserDto> {
    const user = await this.userService.findOneById(id);
    return {
      username: user.username,
      email: user.email,
      userType: user.userType,
    };
  }

  @Get('username/:username')
  async findOneByUsername(
    @Param('username') username: string,
  ): Promise<SerializedUserDto> {
    const user = await this.userService.findOneByUsername(username);
    return {
      username: user.username,
      email: user.email,
      userType: user.userType,
    };
  }

  @SkipAuth()
  @Post()
  async create(@Body() createUserDto: CreateUserDto) {
    const user = await this.userService.create(createUserDto);
    return { message: `User ${user.username} has been created` };
  }

  @Patch(':id')
  async update(@Param('id') id: number, @Body() updateUserDto: UpdateUserDto) {
    const user = await this.userService.update(id, updateUserDto, false);
    return { message: `User ${user.username} has been updated` };
  }

  @Delete(':id')
  async remove(@Param('id') id: number, @Req() req) {
    const user = await this.userService.remove(id);
    return { message: `User ${user.username} has been deleted` };
  }
}
