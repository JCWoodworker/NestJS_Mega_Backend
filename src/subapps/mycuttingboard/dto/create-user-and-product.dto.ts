import { IsString, IsNumber } from 'class-validator';

export class CreateUserAndProductDto {
  @IsString()
  user_id: string;

  @IsNumber()
  product_id?: number;
}
