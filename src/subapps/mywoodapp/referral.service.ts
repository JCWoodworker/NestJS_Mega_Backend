import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateReferralDto } from './dto/create-referral.dto';
import { Referral } from './entities/referral.entity';

@Injectable()
export class ReferralService {
  private readonly allowedSources: string[];

  constructor(
    @InjectRepository(Referral)
    private referralRepository: Repository<Referral>,
    private configService: ConfigService,
  ) {
    const sources = this.configService.get<string>('ALLOWED_REFERRAL_SOURCES');
    this.allowedSources = sources?.split(',').map((s) => s.trim()) || [];
  }

  async create(
    createReferralDto: CreateReferralDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Referral> {
    if (
      this.allowedSources.length > 0 &&
      !this.allowedSources.includes(createReferralDto.source)
    ) {
      throw new BadRequestException('Invalid referral source');
    }

    const referral = this.referralRepository.create({
      source: createReferralDto.source,
      timestamp: new Date(createReferralDto.timestamp),
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    return await this.referralRepository.save(referral);
  }
}
