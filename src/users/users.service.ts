import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Users } from '@users/entities/users.entity';

import { RefreshTokensService } from '@iam/authentication/refresh-token-storage/refresh-token-storage.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
    private readonly refreshTokensService: RefreshTokensService,
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

    /**
     * Sign-in and refresh both reject a locked account, but an already-issued
     * access token keeps working until it expires. Dropping the stored refresh
     * token closes the renewal path, so the lock takes full effect within one
     * access-token lifetime instead of being extendable indefinitely.
     */
    if (locked) {
      await this.refreshTokensService.invalidateRefreshToken(id);
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isLocked: user.isLocked,
    };
  }
}
