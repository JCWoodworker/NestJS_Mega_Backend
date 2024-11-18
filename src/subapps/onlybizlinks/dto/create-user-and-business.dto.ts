import { IsNumber, IsString } from 'class-validator';

export class CreateUserAndBusinessDto {
  @IsNumber()
  business_id: number;

  @IsString()
  user_id: string;
}
