import { Injectable } from '@nestjs/common';
// import { CreateUserDto } from './dto/create-user.dto';
// import { UpdateUserDto } from './dto/update-user.dto';

// This should be a real class/interface representing a user entity
export type User = any;

@Injectable()
export class UserService {
  private readonly userList = [
    {
      userId: 1,
      username: 'james',
      password: 'pass',
    },
    {
      userId: 2,
      username: 'amanda',
      password: 'pass',
    },
    {
      userId: 3,
      username: 'sully',
      password: 'pass',
    },
  ];

  async findOne(username: string): Promise<User | undefined> {
    return this.userList.find((user) => user.username === username);
  }
}
