import { MeasurementType } from '../enums/measurement-type.enum';

/**
 * Shape of a single seed/upsert record. Not validated by a Nest
 * ValidationPipe (there's no REST surface for this module — MCP only);
 * `seed-wood-pricing.ts` is responsible for trusting the JSON file's shape.
 */
export interface UpsertWoodMaterialDto {
  species: string;
  measurementType: MeasurementType;
  thickness?: string | null;
  unitPrice: number;
  dimensions?: Record<string, unknown> | null;
}
