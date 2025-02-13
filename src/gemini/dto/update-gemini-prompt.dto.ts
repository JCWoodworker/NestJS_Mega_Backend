import { PartialType } from '@nestjs/mapped-types';
import { CreateGeminiPromptDto } from '@gemini/dto/create-gemini-prompt.dto';

export class UpdateGeminiPromptDto extends PartialType(CreateGeminiPromptDto) {}
