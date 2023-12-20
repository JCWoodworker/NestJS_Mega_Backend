import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Users } from './entities/users.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ConfigType } from '@nestjs/config';
import authConfig from '../config/auth.config';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
    @Inject(authConfig.KEY)
    private readonly authConfiguration: ConfigType<typeof authConfig>,
  ) {}

  saltConfig = this.authConfiguration.saltRounds;

  async findAll(): Promise<any> {
    const users = await this.usersRepository.find();
    return users.map((user) => {
      return {
        id: user.userId,
        name: user.username,
        email: user.email,
        userType: user.userType,
      };
    });
  }

  async findOneById(userId: number) {
    return await this.usersRepository.findOne({
      where: { userId: userId },
    });
    throw new Error('Unauthorized - user must be admin to perform this action');
  }
  async findOneByUsername(username: string) {
    return await this.usersRepository.findOne({
      where: { username: username },
    });
  }

  async findOneByEmail(email: string) {
    return await this.usersRepository.findOne({
      where: { email: email },
    });
  }

  async create(createUserDto: CreateUserDto) {
    const user = this.usersRepository.create(createUserDto);
    const salt = bcrypt.genSaltSync(this.saltConfig);
    user.password = await bcrypt.hash(user.password, salt);
    user.username = user.username.toLowerCase();
    return this.usersRepository.save(user);
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    const user = await this.usersRepository.preload({
      userId: +id,
      ...updateUserDto,
    });
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return this.usersRepository.save(user);
  }

  async remove(userId: number) {
    const user = await this.findOneById(userId);
    return this.usersRepository.remove(user);
  }
}
