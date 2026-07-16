import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

import { MeasurementType } from '../enums/measurement-type.enum';

export class UpsertWoodMaterialDto {
  @IsString()
  species: string;

  @IsEnum(MeasurementType)
  measurementType: MeasurementType;

  @IsOptional()
  @IsString()
  thickness?: string | null;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsObject()
  dimensions?: Record<string, unknown> | null;
}
