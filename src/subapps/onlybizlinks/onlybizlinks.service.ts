import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MrlRestaurants } from './entities/mrlRestaurants.entity';
import { MrlCustomLinks } from './entities/mrlCustomLinks.entity';
import { MrlSocialLinks } from './entities/mrlSocialLinks.entity';

import { CreateBusinessDto } from './dto/create-business.dto';
import { CreateCustomLinkDto } from './dto/create-custom-link.dto';
import { CreateSocialLinkDto } from './dto/create-social-link.dto';
@Injectable()
export class OnlyBizlinksService {
  constructor(
    @InjectRepository(MrlRestaurants)
    private readonly restaurantsRepository: Repository<MrlRestaurants>,
    @InjectRepository(MrlCustomLinks)
    private readonly customLinksRepository: Repository<MrlCustomLinks>,
    @InjectRepository(MrlSocialLinks)
    private readonly socialLinksRepository: Repository<MrlSocialLinks>,
  ) {}

  async create(createNewRestaurantDto: CreateBusinessDto) {
    return await this.restaurantsRepository.save(createNewRestaurantDto);
  }

  async findOne(incomingDomain: string): Promise<MrlRestaurants> {
    try {
      const restaurantData = await this.restaurantsRepository.findOne({
        where: { domain: incomingDomain },
        relations: ['customLinks', 'socialLinks'],
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

  async createSocialLink(newSocialLink: CreateSocialLinkDto) {
    try {
      const restaurant = await this.restaurantsRepository.findOne({
        where: { id: newSocialLink.restaurant_id },
      });

      if (!restaurant) {
        throw new NotFoundException(
          `Restaurant with id ${newSocialLink.restaurant_id} not found`,
        );
      }

      const createdSocialLink =
        await this.socialLinksRepository.save(newSocialLink);
      return createdSocialLink;
    } catch (error) {
      debugger;
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Error creating social link: ${error.message}`);
    }
  }

  // update(id: number, updateMyrestaurantlinkDto: UpdateMyrestaurantlinkDto) {
  //   return `This action updates a #${id} myrestaurantlink`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} myrestaurantlink`;
  // }
}
