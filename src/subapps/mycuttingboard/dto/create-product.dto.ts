import { IsString, IsEnum, IsOptional, IsUrl } from 'class-validator';

import { CbcProductEnum } from '../entities/cbcProducts.entity';

export class CreateProductDto {
  @IsEnum(CbcProductEnum)
  type: CbcProductEnum;

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  customer_message?: string;

  @IsString()
  @IsOptional()
  user_id?: string;

  @IsUrl()
  @IsOptional()
  image_url?: string;
}
