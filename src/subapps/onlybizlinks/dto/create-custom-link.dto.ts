import { IsNumber, IsString, IsUrl } from 'class-validator';

export class CreateCustomLinkDto {
  @IsString()
  title: string;

  @IsUrl()
  url: string;

  @IsNumber()
  business_id: number;
}
