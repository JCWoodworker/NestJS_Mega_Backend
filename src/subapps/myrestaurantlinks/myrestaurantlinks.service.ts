import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MrlRestaurants } from './entities/mrlRestaurants.entity';

import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { CreateCustomLinkDto } from './dto/create-custom-link.dto';
import { MrlCustomLinks } from './entities/mrlCustomLinks.entity';
@Injectable()
export class MyrestaurantlinksService {
  constructor(
    @InjectRepository(MrlRestaurants)
    private readonly restaurantsRepository: Repository<MrlRestaurants>,
    @InjectRepository(MrlCustomLinks)
    private readonly customLinksRepository: Repository<MrlCustomLinks>,
  ) {}

  async create(createNewRestaurantDto: CreateRestaurantDto) {
    return await this.restaurantsRepository.save(createNewRestaurantDto);
  }

  async findOne(incomingDomain: string): Promise<MrlRestaurants> {
    try {
      const restaurantData = await this.restaurantsRepository.findOne({
        where: { domain: incomingDomain },
        relations: ['customLinks'],
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

  async createCustomLink(newCustomLink: CreateCustomLinkDto) {
    try {
      const restaurant = await this.restaurantsRepository.findOne({
        where: { id: newCustomLink.restaurant_id },
      });

      if (!restaurant) {
        throw new NotFoundException(
          `Restaurant with id ${newCustomLink.restaurant_id} not found`,
        );
      }

      const createdCustomLink =
        await this.customLinksRepository.save(newCustomLink);
      return createdCustomLink;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Error creating custom link: ${error.message}`);
    }
  }

  // update(id: number, updateMyrestaurantlinkDto: UpdateMyrestaurantlinkDto) {
  //   return `This action updates a #${id} myrestaurantlink`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} myrestaurantlink`;
  // }
}
