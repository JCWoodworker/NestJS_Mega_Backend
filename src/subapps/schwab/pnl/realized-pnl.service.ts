import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SchwabRealizedTrade } from './entities/schwab-realized-trade.entity';
import { SchwabTradeFill } from './entities/schwab-trade-fill.entity';
import { FillInstruction } from './enums/fill-instruction.enum';
import { matchFills } from './fifo-matcher.util';

@Injectable()
export class RealizedPnlService {
  private readonly logger = new Logger(RealizedPnlService.name);

  constructor(
    @InjectRepository(SchwabTradeFill)
    private readonly fillRepository: Repository<SchwabTradeFill>,
    @InjectRepository(SchwabRealizedTrade)
    private readonly realizedRepository: Repository<SchwabRealizedTrade>,
  ) {}

  /** Delete-and-recompute all realized trades for an account from fills. */
  async rebuildForAccount(accountHash: string): Promise<number> {
    const fills = await this.fillRepository.find({
      where: { accountHash },
      order: { transactionDate: 'ASC' },
    });

    const matches = matchFills(
      fills.map((f) => ({
        id: f.id,
        symbol: f.symbol,
        instruction: f.instruction as FillInstruction,
        quantity: Number(f.quantity),
        price: Number(f.price),
        transactionDate: f.transactionDate,
        positionEffect: f.positionEffect,
        source: f.source,
      })),
    );

    await this.realizedRepository.delete({ accountHash });

    if (matches.length) {
      await this.realizedRepository.save(
        matches.map((m) => ({
          accountHash,
          symbol: m.symbol,
          direction: m.direction,
          quantity: m.quantity,
          openPrice: m.openPrice,
          closePrice: m.closePrice,
          openedAt: m.openedAt,
          closedAt: m.closedAt,
          realizedPnl: m.realizedPnl,
          openFillId: m.openFillId,
          closeFillId: m.closeFillId,
          source: m.source,
        })),
      );
    }

    this.logger.debug(
      `Rebuilt ${matches.length} realized trades for ${accountHash}`,
    );
    return matches.length;
  }
}
