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

  async findOne(incomingDomain: string): Promise<MrlRestaurants> {
    try {
      debugger;
      const restaurantData = await this.restaurantsRepository.findOneBy({
        domain: incomingDomain,
      });

      if (!restaurantData) {
        throw new NotFoundException(
          `Restaurant with domain ${incomingDomain} not found`,
        );
      }

      return restaurantData;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Error finding restaurant: ${error.message}`);
    }
  }

  // update(id: number, updateMyrestaurantlinkDto: UpdateMyrestaurantlinkDto) {
  //   return `This action updates a #${id} myrestaurantlink`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} myrestaurantlink`;
  // }
}
