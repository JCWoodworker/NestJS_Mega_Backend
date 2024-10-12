import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MrlRestaurants } from './entities/mrlRestaurants.entity';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
@Injectable()
export class MyrestaurantlinksService {
  constructor(
    @InjectRepository(MrlRestaurants)
    private readonly restaurantsRepository: Repository<MrlRestaurants>,
  ) {}

  async create(createNewRestaurantDto: CreateRestaurantDto) {
    return await this.restaurantsRepository.save(createNewRestaurantDto);
  }

  async findOne(incomingDomain: string) {
    try {
      const restaurantData = await this.restaurantsRepository.findOne({
        where: {
          domain: incomingDomain,
        },
      });
      if (!restaurantData) {
        return new NotFoundException(
          `Restaurant with domain ${incomingDomain} not found`,
        );
      } else {
        return restaurantData;
      }
    } catch (error) {
      console.error('Error finding restaurant:', error);
    }
  }

  // update(id: number, updateMyrestaurantlinkDto: UpdateMyrestaurantlinkDto) {
  //   return `This action updates a #${id} myrestaurantlink`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} myrestaurantlink`;
  // }
}
