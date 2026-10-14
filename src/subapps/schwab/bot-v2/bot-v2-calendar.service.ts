import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { etDateKey } from '@schwab/pnl/et-date.util';

import {
  CalendarBook,
  CalendarBookQuery,
  CalendarClose,
  CalendarDay,
  CalendarMark,
  CalendarMonthView,
  buildTrainerMonth,
  isCalendarBook,
  isDayKey,
  isMonday,
  isMonthKey,
  mondayOf,
  normalizeNote,
  topUpAmount,
} from './bot-v2-calendar.util';
import { BotV2StateService } from './bot-v2-state.service';
import { CalendarCapitalEvent } from './entities/calendar-capital-event.entity';
import { CalendarNote } from './entities/calendar-note.entity';
import { BotV2Trade } from './entities/bot-v2-trade.entity';

const TRAINER_BOOK: CalendarBook = 'trainer';

@Injectable()
export class BotV2CalendarService {
  constructor(
    private readonly stateService: BotV2StateService,
    @InjectRepository(BotV2Trade)
    private readonly trades: Repository<BotV2Trade>,
    @InjectRepository(CalendarCapitalEvent)
    private readonly capital: Repository<CalendarCapitalEvent>,
    @InjectRepository(CalendarNote)
    private readonly notes: Repository<CalendarNote>,
  ) {}

  async month(userId: string, month: string, book: string) {
    const parsedBook = this.parseBook(book);
    if (!isMonthKey(month)) throw new BadRequestException('month must be YYYY-MM');
    const today = etDateKey();
    if (parsedBook !== 'all' && parsedBook !== TRAINER_BOOK) {
      return this.emptyMonth(month, parsedBook, today);
    }
    await this.ensureBaseline(userId);
    const [closes, marks, noteRows] = await Promise.all([
      this.trainerCloses(userId),
      this.trainerMarks(userId),
      this.notes.find({ where: { userId } }),
    ]);
    const view = buildTrainerMonth({ month, today, closes, marks });
    const noteFor = (grain: CalendarNote['grain'], key: string) =>
      noteRows.find((row) => row.grain === grain && row.periodKey === key)?.body ?? null;
    return {
      month,
      book: parsedBook,
      wired: true,
      today,
      summary: {
        pnl: view.pnl,
        startEquity: view.startEquity,
        added: view.added,
        percent: view.percent,
        note: noteFor('month', month),
      },
      weeks: view.weeks.map((week) => ({
        monday: week.monday,
        pnl: week.pnl,
        startEquity: week.startEquity,
        added: week.added,
        percent: week.percent,
        note: noteFor('week', week.monday),
        days: week.days.map((day) => this.dayPayload(day, parsedBook, noteFor('day', day.date))),
      })),
    };
  }

  async day(userId: string, date: string, book: string) {
    const parsedBook = this.parseBook(book);
    if (!isDayKey(date)) throw new BadRequestException('date must be YYYY-MM-DD');
    if (parsedBook !== 'all' && parsedBook !== TRAINER_BOOK) {
      return { date, book: parsedBook, wired: false, trades: [], note: null, pnl: null, added: 0, percent: null };
    }
    await this.ensureBaseline(userId);
    const [rows, marks, note] = await Promise.all([
      this.trades.find({ where: { userId }, order: { closedAt: 'ASC' } }),
      this.trainerMarks(userId),
      this.notes.findOne({ where: { userId, grain: 'day', periodKey: date } }),
    ]);
    const closes = rows.map((row) => this.toClose(row));
    const month = date.slice(0, 7);
    const view = buildTrainerMonth({ month, today: etDateKey(), closes, marks });
    const day = view.weeks.flatMap((week) => week.days).find((item) => item.date === date);
    const trades = rows
      .filter((row) => etDateKey(new Date(Number(row.closedAt))) === date)
      .map((row) => ({
        id: row.id,
        book: TRAINER_BOOK,
        symbol: row.symbol,
        direction: row.direction,
        quantity: row.quantity,
        entryPrice: Number(row.entryPrice),
        exitPrice: Number(row.exitPrice),
        exitReason: row.exitReason,
        netPnl: Number(row.netPnl),
        closedAt: Number(row.closedAt),
      }));
    return {
      date,
      book: parsedBook,
      wired: true,
      pnl: day?.pnl ?? null,
      startEquity: day?.startEquity ?? null,
      added: day?.added ?? 0,
      percent: day?.percent ?? null,
      note: note?.body ?? null,
      trades,
    };
  }

  async saveNote(userId: string, grain: string, periodKey: string, text: string | null) {
    if (grain !== 'day' && grain !== 'week' && grain !== 'month') {
      throw new BadRequestException('grain must be day, week, or month');
    }
    this.assertPeriod(grain, periodKey);
    const body = normalizeNote(text);
    const existing = await this.notes.findOne({ where: { userId, grain, periodKey } });
    if (!body) {
      if (existing) await this.notes.delete({ id: existing.id });
      return { grain, periodKey, note: null };
    }
    if (existing) {
      existing.body = body;
      await this.notes.save(existing);
    } else {
      await this.notes.save(this.notes.create({ userId, grain, periodKey, body }));
    }
    return { grain, periodKey, note: body };
  }

  async recordTopUp(userId: string, balanceBefore: number): Promise<void> {
    const amount = topUpAmount(balanceBefore);
    if (amount == null) return;
    const now = new Date();
    await this.capital.save(
      this.capital.create({
        userId,
        book: TRAINER_BOOK,
        kind: 'TOP_UP',
        etDateKey: etDateKey(now),
        at: now,
        balanceBefore,
        balanceAfter: round2(balanceBefore + amount),
        amount,
      }),
    );
  }

  /** The first flat reading after this ships. Not cash added. */
  async ensureBaseline(userId: string): Promise<void> {
    const existing = await this.capital.findOne({
      where: { userId, book: TRAINER_BOOK, kind: 'BASELINE' },
    });
    if (existing) return;
    const state = await this.stateService.get(userId);
    if (state.openPosition) return;
    const now = new Date();
    try {
      await this.capital.save(
        this.capital.create({
          userId,
          book: TRAINER_BOOK,
          kind: 'BASELINE',
          etDateKey: etDateKey(now),
          at: now,
          balanceBefore: null,
          balanceAfter: Number(state.paperEquity),
          amount: 0,
        }),
      );
    } catch {
      // A second read can lose the race. One baseline is enough.
    }
  }

  private async trainerCloses(userId: string): Promise<CalendarClose[]> {
    const rows = await this.trades.find({ where: { userId } });
    return rows.map((row) => this.toClose(row));
  }

  private async trainerMarks(userId: string): Promise<CalendarMark[]> {
    const rows = await this.capital.find({
      where: { userId, book: TRAINER_BOOK },
      order: { at: 'ASC' },
    });
    return rows.map((row) => ({
      kind: row.kind,
      at: row.at.getTime(),
      etDate: row.etDateKey,
      amount: Number(row.amount),
      balanceAfter: Number(row.balanceAfter),
    }));
  }

  private toClose(row: BotV2Trade): CalendarClose {
    const at = Number(row.closedAt);
    return { at, etDate: etDateKey(new Date(at)), netPnl: Number(row.netPnl) };
  }

  private dayPayload(day: CalendarDay, book: CalendarBookQuery, note: string | null) {
    const slice = {
      book: TRAINER_BOOK,
      pnl: day.pnl,
      startEquity: day.startEquity,
      added: day.added,
      percent: day.percent,
    };
    return {
      ...day,
      note,
      books: book === 'all' && !day.empty ? [slice] : undefined,
    };
  }

  private emptyMonth(month: string, book: CalendarBook, today: string) {
    const view: CalendarMonthView = buildTrainerMonth({
      month,
      today,
      closes: [],
      marks: [],
    });
    return {
      month,
      book,
      wired: false,
      today,
      summary: { pnl: null, startEquity: null, added: 0, percent: null, note: null },
      weeks: view.weeks.map((week) => ({
        ...week,
        note: null,
        days: week.days.map((day) => ({ ...day, note: null })),
      })),
    };
  }

  private parseBook(book: string): CalendarBookQuery {
    if (book === 'all' || isCalendarBook(book)) return book;
    throw new BadRequestException('Unknown calendar book');
  }

  private assertPeriod(grain: 'day' | 'week' | 'month', periodKey: string) {
    if (grain === 'month' && isMonthKey(periodKey)) return;
    if (grain === 'day' && isDayKey(periodKey)) return;
    if (grain === 'week' && isMonday(periodKey)) return;
    if (grain === 'week' && isDayKey(periodKey)) {
      throw new BadRequestException(`week must be the Monday ${mondayOf(periodKey)}`);
    }
    throw new BadRequestException('periodKey does not match grain');
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
