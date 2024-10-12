import { IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateRestaurantDto {
  @IsString()
  name: string;

  @IsUrl()
  @IsOptional()
  logo: string;

  @IsString()
  domain: string;
}
