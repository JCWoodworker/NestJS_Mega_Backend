import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { OblBusinesses } from './entities/oblBusinesses.entity';
import { OblCustomLinks } from './entities/oblCustomLinks.entity';
import { OblSocialLinks } from './entities/oblSocialLinks.entity';

import { CreateBusinessDto } from './dto/create-business.dto';
import { CreateCustomLinkDto } from './dto/create-custom-link.dto';
import { CreateSocialLinkDto } from './dto/create-social-link.dto';

@Injectable()
export class OnlyBizlinksService {
  constructor(
    @InjectRepository(OblBusinesses)
    private readonly businessesRepository: Repository<OblBusinesses>,
    @InjectRepository(OblCustomLinks)
    private readonly customLinksRepository: Repository<OblCustomLinks>,
    @InjectRepository(OblSocialLinks)
    private readonly socialLinksRepository: Repository<OblSocialLinks>,
  ) {}

  async create(createNewBusinessDto: CreateBusinessDto) {
    try {
      const existingBusinessByName = await this.businessesRepository.findOne({
        where: { name: createNewBusinessDto.name },
      });
      const existingBusinessByDomain = await this.businessesRepository.findOne({
        where: { domain: createNewBusinessDto.domain },
      });
      if (existingBusinessByName && existingBusinessByDomain) {
        throw new ConflictException(
          `A business with both that name and domain already exists.`,
        );
      } else if (existingBusinessByName) {
        throw new ConflictException(
          `A business with that name already exists.`,
        );
      } else if (existingBusinessByDomain) {
        throw new ConflictException(
          `A business with that domain already exists.`,
        );
      }

      return await this.businessesRepository.save(createNewBusinessDto);
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new Error(`Error creating business: ${error.message}`);
    }
  }

  async findOne(incomingDomain: string): Promise<OblBusinesses> {
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
