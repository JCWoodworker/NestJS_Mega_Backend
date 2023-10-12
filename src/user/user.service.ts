import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
// import { CreateUserDto } from './dto/create-user.dto';
// import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}
  async findAll(): Promise<any> {
    const users = await this.userRepository.find();
    return users.map((user) => {
      return `This fucking guy's ID --> ${user.userId} and their fucking name --> ${user.username}`;
    });
  }

  findOne(userId: number): Promise<User | null> {
    return this.userRepository.findOneBy({ userId });
  }

  async remove(id: number): Promise<void> {
    await this.userRepository.delete(id);
  }
}
