import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { UpsertWoodMaterialDto } from './dto/upsert-wood-material.dto';
import { WoodMaterial } from './entities/wood-material.entity';
import { MeasurementType } from './enums/measurement-type.enum';

export interface CalculatedCost {
  [key: string]: unknown;
  species: string;
  measurementType: MeasurementType;
  thickness: string | null;
  quantity: number;
  unitPrice: number;
  totalCost: number;
  lastUpdated: Date;
}

export interface CatalogThicknessOption {
  [key: string]: unknown;
  thickness: string | null;
  unitPrice: number;
}

export interface MaterialCatalogEntry {
  [key: string]: unknown;
  species: string;
  measurementType: MeasurementType;
  availableThicknesses: CatalogThicknessOption[];
  lastUpdated: Date;
}

@Injectable()
export class WoodPricingService {
  constructor(
    @InjectRepository(WoodMaterial)
    private readonly woodMaterialRepository: Repository<WoodMaterial>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Returns the full pricing catalog grouped by (species, measurementType),
   * with every stocked thickness and its unit price nested underneath. This
   * is the discovery step for MCP clients/widgets: it tells them every valid
   * (species, thickness) pair up front, so calculate_project_cost never has
   * to guess or ask a clarifying question.
   */
  async getMaterialCatalog(): Promise<MaterialCatalogEntry[]> {
    const rows = await this.woodMaterialRepository.find({
      order: { species: 'ASC', measurementType: 'ASC', thickness: 'ASC' },
    });

    const groups = new Map<string, MaterialCatalogEntry>();

    for (const row of rows) {
      const key = `${row.species}::${row.measurementType}`;
      const existing = groups.get(key);
      const thicknessOption: CatalogThicknessOption = {
        thickness: row.thickness,
        unitPrice: Number(row.unitPrice),
      };

      if (existing) {
        existing.availableThicknesses.push(thicknessOption);
        if (row.lastUpdated > existing.lastUpdated) {
          existing.lastUpdated = row.lastUpdated;
        }
      } else {
        groups.set(key, {
          species: row.species,
          measurementType: row.measurementType,
          availableThicknesses: [thicknessOption],
          lastUpdated: row.lastUpdated,
        });
      }
    }

    return Array.from(groups.values());
  }

  async upsertMany(items: UpsertWoodMaterialDto[]): Promise<number> {
    await this.dataSource.transaction(async (manager) => {
      for (const item of items) {
        await manager.upsert(
          WoodMaterial,
          {
            species: item.species,
            measurementType: item.measurementType,
            thickness: item.thickness ?? null,
            unitPrice: item.unitPrice,
            dimensions: item.dimensions ?? null,
          },
          ['species', 'measurementType', 'thickness'],
        );
      }
    });

    return items.length;
  }

  /**
   * species + thickness must come from get_material_catalog's output, so
   * this never has to disambiguate between measurement types or stocked
   * thicknesses the way the old single-tool design did.
   */
  async calculateCost(
    species: string,
    thickness: string,
    quantity: number,
  ): Promise<CalculatedCost> {
    const candidates = await this.woodMaterialRepository.find({
      where: { species, thickness },
    });

    if (candidates.length === 0) {
      throw new NotFoundException(
        `No pricing found for "${species}" at thickness "${thickness}". Call get_material_catalog to see valid species/thickness combinations.`,
      );
    }

    if (candidates.length > 1) {
      const types = candidates.map((c) => c.measurementType).join(', ');
      throw new NotFoundException(
        `"${species}" at thickness "${thickness}" exists under multiple measurement types (${types}). This shouldn't normally happen — check the catalog data.`,
      );
    }

    const material = candidates[0];
    const unitPrice = Number(material.unitPrice);
    const totalCost = Math.round(unitPrice * quantity * 100) / 100;

    return {
      species: material.species,
      measurementType: material.measurementType,
      thickness: material.thickness,
      quantity,
      unitPrice,
      totalCost,
      lastUpdated: material.lastUpdated,
    };
  }
}
