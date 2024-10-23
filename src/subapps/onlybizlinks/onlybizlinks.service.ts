import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MrlBusinesses } from './entities/mrlBusinesses.entity';
import { MrlCustomLinks } from './entities/mrlCustomLinks.entity';
import { MrlSocialLinks } from './entities/mrlSocialLinks.entity';

import { CreateBusinessDto } from './dto/create-business.dto';
import { CreateCustomLinkDto } from './dto/create-custom-link.dto';
import { CreateSocialLinkDto } from './dto/create-social-link.dto';
@Injectable()
export class OnlyBizlinksService {
  constructor(
    @InjectRepository(MrlBusinesses)
    private readonly businessesRepository: Repository<MrlBusinesses>,
    @InjectRepository(MrlCustomLinks)
    private readonly customLinksRepository: Repository<MrlCustomLinks>,
    @InjectRepository(MrlSocialLinks)
    private readonly socialLinksRepository: Repository<MrlSocialLinks>,
  ) {}

  async create(createNewBusinessDto: CreateBusinessDto) {
    return await this.businessesRepository.save(createNewBusinessDto);
  }

  async findOne(incomingDomain: string): Promise<MrlBusinesses> {
    try {
      const businessData = await this.businessesRepository.findOne({
        where: { domain: incomingDomain },
        relations: ['customLinks', 'socialLinks'],
      });

      if (!businessData) {
        throw new NotFoundException(
          `Business with domain ${incomingDomain} not found`,
        );
      }

      return businessData;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Error finding business: ${error.message}`);
    }
  }

  async createCustomLink(newCustomLink: CreateCustomLinkDto) {
    try {
      const business = await this.businessesRepository.findOne({
        where: { id: newCustomLink.business_id },
      });

      if (!business) {
        throw new NotFoundException(
          `Business with id ${newCustomLink.business_id} not found`,
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
      const business = await this.businessesRepository.findOne({
        where: { id: newSocialLink.business_id },
      });

      if (!business) {
        throw new NotFoundException(
          `Business with id ${newSocialLink.business_id} not found`,
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
}
