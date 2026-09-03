import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SchwabOrderSourceTag } from './entities/schwab-order-source-tag.entity';
import { OrderSource } from './enums/order-source.enum';

@Injectable()
export class OrderSourceTagService {
  constructor(
    @InjectRepository(SchwabOrderSourceTag)
    private readonly tagRepository: Repository<SchwabOrderSourceTag>,
  ) {}

  async tag(
    orderId: string,
    accountHash: string,
    source: OrderSource,
  ): Promise<void> {
    if (!orderId) return;
    await this.tagRepository.save({ orderId, accountHash, source });
  }

  async lookup(orderId: string | null | undefined): Promise<OrderSource> {
    if (!orderId) return OrderSource.MANUAL_LIVE;
    const row = await this.tagRepository.findOne({ where: { orderId } });
    return row?.source ?? OrderSource.MANUAL_LIVE;
  }
}
