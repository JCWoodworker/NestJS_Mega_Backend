import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Users } from '@users/entities/users.entity';
import { Role } from '@users/enums/role.enum';

import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let repository: Repository<Users>;

  const mockUsers: Users[] = [
    {
      id: '1',
      email: 'user1@example.com',
      password: 'hashed_password',
      role: Role.Basic,
      googleId: null,
      first_name: 'John',
      last_name: 'Doe',
      image_url: null,
      created_at: new Date(),
      updated_at: new Date(),
      usersAndBusinesses: [],
    },
    {
      id: '2',
      email: 'admin@example.com',
      password: 'hashed_password',
      role: Role.Admin,
      googleId: null,
      first_name: 'Admin',
      last_name: 'User',
      image_url: null,
      created_at: new Date(),
      updated_at: new Date(),
      usersAndBusinesses: [],
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(Users),
          useValue: {
            find: jest.fn().mockResolvedValue(mockUsers),
            findOne: jest
              .fn()
              .mockImplementation(({ where: { id } }) =>
                Promise.resolve(mockUsers.find((user) => user.id === id)),
              ),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get<Repository<Users>>(getRepositoryToken(Users));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all users with limited fields', async () => {
      const result = await service.findAll();

      expect(result).toEqual([
        {
          id: mockUsers[0].id,
          email: mockUsers[0].email,
          role: mockUsers[0].role,
        },
        {
          id: mockUsers[1].id,
          email: mockUsers[1].email,
          role: mockUsers[1].role,
        },
      ]);

      expect(repository.find).toHaveBeenCalled();
    });

    it('should handle empty users array', async () => {
      jest.spyOn(repository, 'find').mockResolvedValueOnce([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
      expect(repository.find).toHaveBeenCalled();
    });
  });

  describe('findOneById', () => {
    it('should return a user by id with limited fields', async () => {
      const userId = '1';
      const result = await service.findOneById(userId);

      expect(result).toEqual({
        id: mockUsers[0].id,
        email: mockUsers[0].email,
        role: mockUsers[0].role,
      });

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
    });

    it('should handle non-existent user', async () => {
      const userId = 'non-existent';
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);

      await expect(service.findOneById(userId)).rejects.toThrow();

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
    });
  });

  // Add more test cases as you add more methods to the service
});
