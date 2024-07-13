import { IsString, IsUrl } from 'class-validator';

export class CreateLinkDto {
  @IsString()
  user_id: string;

  @IsUrl()
  url: string;

  @IsString()
  title: string;

  @IsString()
  notes: string;
}
