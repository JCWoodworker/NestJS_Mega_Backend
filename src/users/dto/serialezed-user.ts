import { IsString } from 'class-validator';
export class SerializedUserDto {
  @IsString()
  readonly username: string;

  @IsString()
  readonly email: string;

  @IsString()
  readonly userType;
}
