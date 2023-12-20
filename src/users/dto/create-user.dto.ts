import {
  IsString,
  IsStrongPassword,
  IsEmail,
  IsPhoneNumber,
  IsOptional,
  IsEnum,
} from 'class-validator';

enum UserType {
  Admin = 'admin',
  Basic = 'basic',
}

export class CreateUserDto {
  @IsString()
  readonly username: string;

  @IsStrongPassword()
  readonly password: string;

  @IsEmail()
  readonly email: string;

  @IsEnum(UserType)
  readonly userType: UserType = UserType.Basic;

  @IsPhoneNumber('US', {
    message:
      'Phone number must be a valid, 10-digit US phone number with no prefix or dashes',
  })
  @IsOptional()
  readonly cellphone: string;
}
