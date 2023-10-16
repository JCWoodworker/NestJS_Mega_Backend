import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Users } from './entities/users.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
  ) {}
  async findAll(): Promise<any> {
    const users = await this.usersRepository.find();
    return users.map((user) => {
      return `ID --> ${user.userId}, Name --> ${user.username}, Email --> ${user.email}`;
    });
  }

  async findOneById(userId: number, userType: string) {
    if (userType === 'admin') {
      return await this.usersRepository.findOne({
        where: { userId: userId },
      });
    }
    throw new Error('Unauthorized - user must be admin to perform this action');
  }
  async findOneByUsername(username: string) {
    return await this.usersRepository.findOne({
      where: { username: username },
    });
  }

  async create(createUserDto: CreateUserDto) {
    const user = this.usersRepository.create(createUserDto);
    const salt = bcrypt.genSaltSync(parseInt(process.env.SALT_ROUNDS));
    user.password = await bcrypt.hash(user.password, salt);
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

  async remove(userId: number, userType: string) {
    const user = await this.findOneById(userId, userType);
    return this.usersRepository.remove(user);
  }
}
