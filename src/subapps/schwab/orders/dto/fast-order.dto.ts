import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

import { OrderInstruction, OrderType } from '../enums/order-instruction.enum';

export class FastOrderDto {
  @IsString()
  accountHash: string;

  /** 21-character OSI option symbol, e.g. "SPY   260827C00772000". */
  @IsString()
  symbol: string;

  @IsEnum(OrderInstruction)
  instruction: OrderInstruction;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsEnum(OrderType)
  orderType: OrderType;

  /** Required for LIMIT (limit price) and STOP_LIMIT (limit leg once triggered). */
  @ValidateIf(
    (dto: FastOrderDto) =>
      dto.orderType === OrderType.LIMIT ||
      dto.orderType === OrderType.STOP_LIMIT,
  )
  @IsNumber()
  @IsPositive()
  price?: number;

  /** Required trigger price for STOP and STOP_LIMIT orders. */
  @ValidateIf(
    (dto: FastOrderDto) =>
      dto.orderType === OrderType.STOP ||
      dto.orderType === OrderType.STOP_LIMIT,
  )
  @IsNumber()
  @IsPositive()
  stopPrice?: number;

  /** Ignored for STOP/STOP_LIMIT — only applies to marketable LIMIT orders. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  slippageTolerance?: number;
}
