import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

import { etDateKey } from '@schwab/pnl/et-date.util';

import { ExpirationsQueryDto } from './dto/expirations-query.dto';
import { InstrumentSearchQueryDto } from './dto/instrument-search-query.dto';
import { OptionChainQueryDto } from './dto/option-chain-query.dto';
import { PriceHistoryQueryDto } from './dto/price-history-query.dto';
import {
  mapExpirationList,
  osiExpirationToDateKey,
} from './expiration-chain.mapper';
import {
  mapOptionChainResponse,
  OptionChainQuote,
} from './option-chain.mapper';

export interface NormalizedCandle {
  datetime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceHistoryResponse {
  symbol: string;
  candles: NormalizedCandle[];
}

export interface ExpirationsResponse {
  symbol: string;
  expirations: string[];
  asOf: number;
}

export interface InstrumentSearchHit {
  symbol: string;
  description: string;
  exchange: string | null;
  assetType: string | null;
}

export interface InstrumentSearchResponse {
  q: string;
  results: InstrumentSearchHit[];
}

/** 0DTE SPX options trade under SPXW (same as streamer). */
const OPTION_ROOT_OVERRIDES: Record<string, string> = { SPX: 'SPXW' };

/** Short TTL so 1–2s FE polls coalesce instead of stampeding Schwab. */
const CHAIN_CACHE_TTL_MS = 750;

interface ChainCacheEntry {
  expiresAt: number;
  value: OptionChainQuote[];
}

/**
 * Thin authenticated proxy to Schwab Market Data. Reuses `SchwabHttpModule`'s
 * `HttpService` - same Bearer interceptor + keep-alive as orders/streamer.
 */
@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);
  private readonly chainCache = new Map<string, ChainCacheEntry>();
  private readonly chainInflight = new Map<
    string,
    Promise<OptionChainQuote[]>
  >();

  constructor(private readonly httpService: HttpService) {}

  async getPriceHistory(
    query: PriceHistoryQueryDto,
  ): Promise<PriceHistoryResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.get('/marketdata/v1/pricehistory', {
          params: {
            symbol: query.symbol,
            periodType: query.periodType,
            period: query.period,
            frequencyType: query.frequencyType,
            frequency: query.frequency,
            startDate: query.startDate,
            endDate: query.endDate,
          },
        }),
      );

      const rawCandles: Array<Record<string, number>> =
        response.data?.candles ?? [];

      const candles: NormalizedCandle[] = rawCandles.map((candle) => ({
        datetime: candle.datetime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      }));

      return { symbol: response.data?.symbol ?? query.symbol, candles };
    } catch (error) {
      this.logger.error(
        'Price history fetch failed',
        error?.response?.data || error.message,
      );
      throw new BadRequestException(
        error?.response?.data?.message || 'Price history fetch failed',
      );
    }
  }

  /**
   * Search US instruments by ticker and/or company description via Schwab
   * `/instruments` (symbol-search + desc-search merged).
   */
  async searchInstruments(
    query: InstrumentSearchQueryDto,
  ): Promise<InstrumentSearchResponse> {
    const q = query.q.trim();
    if (!q) return { q, results: [] };

    const looksLikeTicker = /^[A-Za-z][A-Za-z0-9.-]{0,9}$/.test(q);
    const projections: Array<{ projection: string; symbol: string }> = [];

    if (looksLikeTicker) {
      projections.push({
        projection: 'symbol-search',
        symbol: q.toUpperCase(),
      });
      projections.push({
        projection: 'symbol-regex',
        symbol: `^${q.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      });
    }
    projections.push({ projection: 'desc-search', symbol: q });

    const batches = await Promise.all(
      projections.map(async ({ projection, symbol }) => {
        try {
          const response = await firstValueFrom(
            this.httpService.get('/marketdata/v1/instruments', {
              params: { symbol, projection },
            }),
          );
          return this.normalizeInstrumentPayload(response.data);
        } catch (error) {
          this.logger.warn(
            `Instrument ${projection} search failed for "${symbol}": ${
              error?.response?.data?.message || error.message
            }`,
          );
          return [] as InstrumentSearchHit[];
        }
      }),
    );

    const bySymbol = new Map<string, InstrumentSearchHit>();
    for (const hit of batches.flat()) {
      if (!hit.symbol) continue;
      const prev = bySymbol.get(hit.symbol);
      if (
        !prev ||
        this.assetRank(hit.assetType) > this.assetRank(prev.assetType)
      ) {
        bySymbol.set(hit.symbol, hit);
      }
    }

    const results = [...bySymbol.values()]
      .sort((a, b) => {
        const aExact = a.symbol === q.toUpperCase() ? 0 : 1;
        const bExact = b.symbol === q.toUpperCase() ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return a.symbol.localeCompare(b.symbol);
      })
      .slice(0, 25);

    return { q, results };
  }

  private assetRank(assetType: string | null): number {
    const t = (assetType ?? '').toUpperCase();
    if (t === 'EQUITY') return 3;
    if (t === 'ETF' || t === 'COLLECTIVE_INVESTMENT') return 2;
    if (t === 'INDEX') return 1;
    return 0;
  }

  private normalizeInstrumentPayload(data: unknown): InstrumentSearchHit[] {
    if (!data || typeof data !== 'object') return [];

    const rows: Array<Record<string, unknown>> = [];
    if (Array.isArray((data as { instruments?: unknown }).instruments)) {
      rows.push(
        ...(data as { instruments: Array<Record<string, unknown>> })
          .instruments,
      );
    } else {
      for (const value of Object.values(data as Record<string, unknown>)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          rows.push(value as Record<string, unknown>);
        }
      }
    }

    return rows
      .map((row) => {
        const symbol = String(row.symbol ?? '')
          .toUpperCase()
          .trim();
        if (!symbol) return null;
        return {
          symbol,
          description: String(row.description ?? row.name ?? '').trim(),
          exchange: row.exchange != null ? String(row.exchange) : null,
          assetType: row.assetType != null ? String(row.assetType) : null,
        } satisfies InstrumentSearchHit;
      })
      .filter((h): h is InstrumentSearchHit => h != null);
  }

  async getExpirations(
    query: ExpirationsQueryDto,
  ): Promise<ExpirationsResponse> {
    const symbol = this.resolveOptionSymbol(query.symbol);
    const todayEt = etDateKey();
    try {
      const response = await firstValueFrom(
        this.httpService.get('/marketdata/v1/expirationchain', {
          params: { symbol },
        }),
      );
      const expirations = mapExpirationList(response.data, {
        todayEt,
        limit: 10,
      });
      return {
        symbol: query.symbol.toUpperCase(),
        expirations,
        asOf: Date.now(),
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(
        'Expiration chain fetch failed',
        error?.response?.data || error.message,
      );
      throw new BadRequestException(
        error?.response?.data?.message || 'Expiration chain fetch failed',
      );
    }
  }

  /**
   * Option-chain quote snapshot (§11b / §11c). Omit `expiration` for today's
   * 0DTE (back-compat). With `expiration`, returns that day only. Short TTL
   * cache for non-0DTE poll MVP.
   */
  async getOptionChain(
    query: OptionChainQueryDto,
  ): Promise<OptionChainQuote[]> {
    const todayEt = etDateKey();
    const expiration = (query.expiration?.trim() || todayEt) as string;
    await this.assertExpirationAllowed(query.symbol, expiration, todayEt);

    if (query.symbols?.trim()) {
      this.assertSymbolsMatchExpiration(query.symbols, expiration);
    }

    const cacheKey = [
      query.symbol.toUpperCase(),
      expiration,
      String(query.strikeCount ?? 16),
      query.symbols?.trim() || '',
    ].join('|');

    const cached = this.chainCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const inflight = this.chainInflight.get(cacheKey);
    if (inflight) return inflight;

    const promise = this.fetchOptionChain(query, expiration)
      .then((quotes) => {
        this.chainCache.set(cacheKey, {
          expiresAt: Date.now() + CHAIN_CACHE_TTL_MS,
          value: quotes,
        });
        return quotes;
      })
      .finally(() => {
        this.chainInflight.delete(cacheKey);
      });

    this.chainInflight.set(cacheKey, promise);
    return promise;
  }

  private async fetchOptionChain(
    query: OptionChainQueryDto,
    expiration: string,
  ): Promise<OptionChainQuote[]> {
    const symbol = this.resolveOptionSymbol(query.symbol);
    try {
      const response = await firstValueFrom(
        this.httpService.get('/marketdata/v1/chains', {
          params: {
            symbol,
            contractType: 'ALL',
            strikeCount: query.strikeCount ?? 16,
            fromDate: expiration,
            toDate: expiration,
          },
        }),
      );

      const quotes = mapOptionChainResponse(response.data);
      if (!query.symbols) return quotes;

      const wanted = new Set(query.symbols.split(',').map((s) => s.trim()));
      return quotes.filter((q) => wanted.has(q.symbol));
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(
        'Option chain fetch failed',
        error?.response?.data || error.message,
      );
      throw new BadRequestException(
        error?.response?.data?.message || 'Option chain fetch failed',
      );
    }
  }

  /** SPX equity → SPXW option root (streamer invariant). */
  private resolveOptionSymbol(symbol: string): string {
    const upper = symbol.toUpperCase();
    return OPTION_ROOT_OVERRIDES[upper] ?? upper;
  }

  private async assertExpirationAllowed(
    symbol: string,
    expiration: string,
    todayEt: string,
  ): Promise<void> {
    if (expiration < todayEt) {
      throw new BadRequestException(
        `expiration ${expiration} is in the past (ET today is ${todayEt})`,
      );
    }
    // Today always allowed for 0DTE back-compat without requiring it to appear
    // in the calendar fetch (rare Schwab lag). Non-today must be in the ≤10 list.
    if (expiration === todayEt) return;

    const { expirations } = await this.getExpirations({
      symbol: symbol.toUpperCase(),
    });
    if (!expirations.includes(expiration)) {
      throw new BadRequestException(
        `expiration ${expiration} is not in the nearest listed calendar`,
      );
    }
  }

  private assertSymbolsMatchExpiration(
    symbolsCsv: string,
    expiration: string,
  ): void {
    for (const raw of symbolsCsv.split(',')) {
      const osi = raw.trim();
      if (!osi) continue;
      const key = osiExpirationToDateKey(osi);
      if (key == null) {
        throw new BadRequestException(`Invalid OSI symbol "${osi}"`);
      }
      if (key !== expiration) {
        throw new BadRequestException(
          `OSI ${osi} expiration ${key} does not match requested ${expiration}`,
        );
      }
    }
  }
}
