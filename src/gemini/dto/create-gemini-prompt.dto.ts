import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateGeminiPromptDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  prompt: string;
}
