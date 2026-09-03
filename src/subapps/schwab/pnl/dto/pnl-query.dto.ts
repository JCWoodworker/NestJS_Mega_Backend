import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

import { OrderSource } from '../enums/order-source.enum';
import { TransactionCategory } from '../enums/transaction-category.enum';

export class PnlDateRangeQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  accountHash?: string;
}

export class PnlTransactionsQueryDto extends PnlDateRangeQueryDto {
  @IsOptional()
  @IsEnum(TransactionCategory)
  category?: TransactionCategory;
}

function toSourceArray(value: unknown): OrderSource[] | undefined {
  if (value == null || value === '') return undefined;
  if (Array.isArray(value)) return value as OrderSource[];
  return [value as OrderSource];
}

export class PnlTradesQueryDto extends PnlDateRangeQueryDto {
  @IsOptional()
  @IsString()
  symbol?: string;

  @IsOptional()
  @Transform(({ value }) => toSourceArray(value))
  @IsEnum(OrderSource, { each: true })
  source?: OrderSource[];
}

export class PnlOrdersQueryDto extends PnlDateRangeQueryDto {
  @IsOptional()
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Transform(({ value }) => toSourceArray(value))
  @IsEnum(OrderSource, { each: true })
  source?: OrderSource[];
}
