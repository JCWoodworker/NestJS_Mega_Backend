import {
  Body,
  Controller,
  Get,
  Param,
  ParseArrayPipe,
  Post,
} from '@nestjs/common';

import { UpsertWoodMaterialDto } from './dto/upsert-wood-material.dto';
import { WoodMaterial } from './entities/wood-material.entity';
import { WoodPricingService } from './wood-pricing.service';

@Controller()
export class WoodPricingController {
  constructor(private readonly woodPricingService: WoodPricingService) {}

  @Get()
  async findAll(): Promise<WoodMaterial[]> {
    return this.woodPricingService.findAll();
  }

  @Get(':species')
  async findBySpecies(
    @Param('species') species: string,
  ): Promise<WoodMaterial[]> {
    return this.woodPricingService.findBySpecies(species);
  }

  @Post()
  async create(@Body() dto: UpsertWoodMaterialDto): Promise<WoodMaterial> {
    return this.woodPricingService.create(dto);
  }

  @Post('upsert-bulk')
  async upsertBulk(
    @Body(new ParseArrayPipe({ items: UpsertWoodMaterialDto }))
    items: UpsertWoodMaterialDto[],
  ): Promise<{ upserted: number }> {
    const upserted = await this.woodPricingService.upsertMany(items);
    return { upserted };
  }
}
