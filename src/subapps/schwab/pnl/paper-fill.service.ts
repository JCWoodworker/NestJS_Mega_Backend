import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { etDateKey } from './et-date.util';
import { PaperFillDto } from './dto/paper-fill.dto';
import { SchwabPaperFill } from './entities/schwab-paper-fill.entity';
import { OrderSource } from './enums/order-source.enum';
import { PnlOrdersQueryDto, PnlTradesQueryDto } from './dto/pnl-query.dto';
import { RealizedTradeLike } from './pnl-insight.util';

export interface PaperFillView {
  id: string;
  symbol: string;
  quantity: number;
  price: number;
  at: number;
  side: 'OPEN' | 'CLOSE';
  orderType: 'MARKET' | 'STOP';
  openPrice?: number;
  openedAt?: number;
  realizedPnl?: number;
  exitReason?: 'SELL' | 'FLATTEN' | 'STOP';
}

@Injectable()
export class PaperFillService {
  constructor(
    @InjectRepository(SchwabPaperFill)
    private readonly fills: Repository<SchwabPaperFill>,
  ) {}

  async save(userId: string, incoming: PaperFillDto[]): Promise<{ saved: number }> {
    if (!incoming.length) return { saved: 0 };
    const clientIds = incoming.map((fill) => fill.id);
    const existing = await this.fills.find({
      where: { userId, clientId: In(clientIds) },
    });
    const byClient = new Map(existing.map((row) => [row.clientId, row]));
    const rows = incoming.map((fill) => {
      const prev = byClient.get(fill.id);
      return this.fills.create({
        id: prev?.id,
        userId,
        clientId: fill.id,
        symbol: fill.symbol,
        quantity: fill.quantity,
        price: fill.price,
        at: new Date(fill.at),
        side: fill.side,
        orderType: fill.orderType,
        openPrice: fill.openPrice ?? null,
        openedAt: fill.openedAt != null ? new Date(fill.openedAt) : null,
        realizedPnl: fill.realizedPnl ?? null,
        exitReason: fill.exitReason ?? null,
      });
    });
    await this.fills.save(rows);
    return { saved: rows.length };
  }

  async list(userId: string): Promise<PaperFillView[]> {
    const rows = await this.fills.find({
      where: { userId },
      order: { at: 'ASC' },
    });
    return rows.map((row) => this.toView(row));
  }

  includes(source?: OrderSource[]): boolean {
    return !source?.length || source.includes(OrderSource.MANUAL_PAPER);
  }

  async orders(userId: string, query: PnlOrdersQueryDto) {
    if (!this.includes(query.source)) return [];
    if (query.status && query.status.toUpperCase() !== 'FILLED') return [];
    const rows = await this.rows(userId, query.symbol);
    return rows
      .filter((row) => this.inRange(row.at, query.from, query.to))
      .map((row) => ({
        id: row.clientId,
        orderId: row.clientId,
        symbol: row.symbol,
        instruction: row.side === 'OPEN' ? 'BUY_TO_OPEN' : 'SELL_TO_CLOSE',
        orderType: row.orderType,
        status: 'FILLED',
        quantity: this.num(row.quantity),
        filledQuantity: this.num(row.quantity),
        price: this.num(row.price),
        stopPrice: row.orderType === 'STOP' ? this.num(row.price) : null,
        averageFillPrice: this.num(row.price),
        enteredTime: row.at.toISOString(),
        closedAt: row.side === 'CLOSE' ? row.at.toISOString() : null,
        source: OrderSource.MANUAL_PAPER,
        statusDescription: row.exitReason
          ? `Sim ${row.exitReason.toLowerCase()}`
          : null,
      }));
  }

  async trades(userId: string, query: PnlTradesQueryDto) {
    if (!this.includes(query.source)) return [];
    const rows = await this.rows(userId, query.symbol);
    return rows
      .filter(
        (row) =>
          row.side === 'CLOSE' &&
          row.realizedPnl != null &&
          this.inRange(row.at, query.from, query.to),
      )
      .map((row) => this.toTrade(row));
  }

  async insightRows(userId: string, query: PnlTradesQueryDto): Promise<RealizedTradeLike[]> {
    if (!this.includes(query.source)) return [];
    const rows = await this.rows(userId, query.symbol);
    return rows
      .filter(
        (row) =>
          row.side === 'CLOSE' &&
          row.realizedPnl != null &&
          this.inRange(row.at, query.from, query.to),
      )
      .map((row) => {
        const opened = row.openedAt ?? row.at;
        return {
          symbol: row.symbol,
          direction: 'LONG',
          quantity: this.num(row.quantity),
          openPrice: this.num(row.openPrice ?? row.price),
          closePrice: this.num(row.price),
          openedAt: opened.getTime(),
          closedAt: row.at.getTime(),
          realizedPnl: this.num(row.realizedPnl),
          source: OrderSource.MANUAL_PAPER,
        };
      });
  }

  /** Closes for the calendar. `etDate` is the America/New_York day. */
  async calendarCloses(userId: string) {
    const rows = await this.fills.find({
      where: { userId, side: 'CLOSE' },
      order: { at: 'ASC' },
    });
    return rows
      .filter((row) => row.realizedPnl != null)
      .map((row) => ({
        etDate: etDateKey(row.at),
        netPnl: this.num(row.realizedPnl),
        trade: {
          id: row.clientId,
          book: 'manual_paper',
          symbol: row.symbol,
          direction: 'LONG',
          quantity: this.num(row.quantity),
          entryPrice: this.num(row.openPrice ?? row.price),
          exitPrice: this.num(row.price),
          exitReason: row.exitReason ?? 'SELL',
          netPnl: this.num(row.realizedPnl),
          closedAt: row.at.getTime(),
        },
      }));
  }

  private async rows(userId: string, symbol?: string) {
    return this.fills.find({
      where: { userId, ...(symbol ? { symbol } : {}) },
      order: { at: 'DESC' },
    });
  }

  private toView(row: SchwabPaperFill): PaperFillView {
    return {
      id: row.clientId,
      symbol: row.symbol,
      quantity: this.num(row.quantity),
      price: this.num(row.price),
      at: row.at.getTime(),
      side: row.side,
      orderType: row.orderType,
      ...(row.openPrice != null ? { openPrice: this.num(row.openPrice) } : {}),
      ...(row.openedAt != null ? { openedAt: row.openedAt.getTime() } : {}),
      ...(row.realizedPnl != null ? { realizedPnl: this.num(row.realizedPnl) } : {}),
      ...(row.exitReason != null ? { exitReason: row.exitReason } : {}),
    };
  }

  private toTrade(row: SchwabPaperFill) {
    const opened = row.openedAt ?? row.at;
    return {
      id: row.clientId,
      symbol: row.symbol,
      direction: 'LONG' as const,
      quantity: this.num(row.quantity),
      openPrice: this.num(row.openPrice ?? row.price),
      closePrice: this.num(row.price),
      openedAt: opened.toISOString(),
      closedAt: row.at.toISOString(),
      realizedPnl: this.num(row.realizedPnl),
      holdingMs: Math.max(0, row.at.getTime() - opened.getTime()),
      source: OrderSource.MANUAL_PAPER,
    };
  }

  private inRange(at: Date, from?: string, to?: string): boolean {
    const day = etDateKey(at);
    if (from && day < from.slice(0, 10)) return false;
    if (to && day > to.slice(0, 10)) return false;
    return true;
  }

  private num(value: number | string | null | undefined): number {
    return Number(value ?? 0);
  }
}
