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

@Injectable()
export class WoodPricingService {
  constructor(
    @InjectRepository(WoodMaterial)
    private readonly woodMaterialRepository: Repository<WoodMaterial>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<WoodMaterial[]> {
    return this.woodMaterialRepository.find({
      order: { species: 'ASC', thickness: 'ASC' },
    });
  }

  async findBySpecies(species: string): Promise<WoodMaterial[]> {
    const rows = await this.woodMaterialRepository.find({
      where: { species },
      order: { thickness: 'ASC' },
    });

    if (rows.length === 0) {
      throw new NotFoundException(`No pricing found for species "${species}"`);
    }

    return rows;
  }

  async findOne(
    species: string,
    measurementType: MeasurementType,
    thickness?: string | null,
  ): Promise<WoodMaterial | null> {
    return this.woodMaterialRepository.findOne({
      where: {
        species,
        measurementType,
        ...(thickness !== undefined ? { thickness } : {}),
      },
    });
  }

  async create(dto: UpsertWoodMaterialDto): Promise<WoodMaterial> {
    const material = this.woodMaterialRepository.create({
      species: dto.species,
      measurementType: dto.measurementType,
      thickness: dto.thickness ?? null,
      unitPrice: dto.unitPrice,
      dimensions: dto.dimensions ?? null,
    });

    return this.woodMaterialRepository.save(material);
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

  async calculateCost(
    species: string,
    quantity: number,
    measurementType: MeasurementType,
    thickness?: string,
  ): Promise<CalculatedCost> {
    const candidates = await this.woodMaterialRepository.find({
      where: { species, measurementType },
    });

    if (candidates.length === 0) {
      throw new NotFoundException(
        `No pricing found for species "${species}" with measurement type "${measurementType}".`,
      );
    }

    let material: WoodMaterial;

    if (thickness) {
      const match = candidates.find((c) => c.thickness === thickness);
      if (!match) {
        const available = candidates
          .map((c) => c.thickness)
          .filter(Boolean)
          .join(', ');
        throw new NotFoundException(
          `No pricing found for "${species}" at thickness "${thickness}". Available thicknesses: ${available}.`,
        );
      }
      material = match;
    } else if (candidates.length === 1) {
      material = candidates[0];
    } else {
      const available = candidates
        .map((c) => c.thickness)
        .filter(Boolean)
        .join(', ');
      throw new NotFoundException(
        `Multiple thicknesses found for "${species}": ${available}. Please specify a thickness.`,
      );
    }

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
