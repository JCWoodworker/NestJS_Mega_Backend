import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Users } from './entities/users.entity';

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
      };
    });
  }

  async findOneById(id: number) {
    const user = await this.usersRepository.findOne({
      where: { id: id },
    });
    return {
      id: user.id,
      email: user.email,
    };
  }

  async findOneByEmail(email: string) {
    return await this.usersRepository.findOne({
      where: { email: email },
    });
  }
}
