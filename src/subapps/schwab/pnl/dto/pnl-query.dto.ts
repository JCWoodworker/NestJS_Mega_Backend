import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

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

export class PnlTradesQueryDto extends PnlDateRangeQueryDto {
  @IsOptional()
  @IsString()
  symbol?: string;
}

export class PnlOrdersQueryDto extends PnlDateRangeQueryDto {
  @IsOptional()
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
