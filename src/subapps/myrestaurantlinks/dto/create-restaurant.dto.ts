import { IsString, IsUrl } from 'class-validator';

export class CreateRestaurantDto {
  @IsString()
  name: string;

  @IsUrl()
  logo: string;
}
