import { IsString, IsUrl } from 'class-validator';

export class CreateLinkDto {
  @IsUrl()
  url: string;

  @IsString()
  title: string;

  @IsString()
  notes: string;
}
