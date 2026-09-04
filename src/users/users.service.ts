import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Users } from '@users/entities/users.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
  ) {}

  async findAll(): Promise<any> {
    const users = await this.usersRepository.find();
    return users.map((user) => {
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        isLocked: user.isLocked,
      };
    });
  }

  async findOneById(id: string) {
    const user = await this.usersRepository.findOne({
      where: { id },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isLocked: user.isLocked,
    };
  }

  async setLocked(id: string, locked: boolean) {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.isLocked = locked;
    await this.usersRepository.save(user);
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isLocked: user.isLocked,
    };
  }
}
