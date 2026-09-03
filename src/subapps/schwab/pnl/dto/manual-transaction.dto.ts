import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { TransactionCategory } from '../enums/transaction-category.enum';

export class CreateManualTransactionDto {
  @IsOptional()
  @IsString()
  accountHash?: string;

  @IsEnum(TransactionCategory)
  category: TransactionCategory;

  @IsNumber()
  amount: number;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  symbol?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateManualTransactionDto {
  @IsOptional()
  @IsEnum(TransactionCategory)
  category?: TransactionCategory;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  symbol?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
