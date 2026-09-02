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

  @ValidateIf((dto: FastOrderDto) => dto.orderType === OrderType.LIMIT)
  @IsNumber()
  @IsPositive()
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  slippageTolerance?: number;
}
