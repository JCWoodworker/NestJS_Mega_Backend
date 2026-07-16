import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';

import { AppModule } from '../../app.module';
import { UpsertWoodMaterialDto } from './dto/upsert-wood-material.dto';
import { WoodPricingService } from './wood-pricing.service';

/**
 * Reads src/subapps/woodpricing/data/wood-pricing-seed.json and upserts every
 * record into the woodpricing_materials table inside a single DB transaction.
 *
 * Run via: yarn seed:woodpricing
 */
async function bootstrap() {
  const seedFilePath = path.join(__dirname, 'data', 'wood-pricing-seed.json');

  if (!fs.existsSync(seedFilePath)) {
    console.error(`Seed file not found at ${seedFilePath}`);
    process.exit(1);
  }

  const rawContents = fs.readFileSync(seedFilePath, 'utf-8');
  const items: UpsertWoodMaterialDto[] = JSON.parse(rawContents);

  if (!Array.isArray(items)) {
    console.error(
      'Seed file must contain a JSON array of wood material records.',
    );
    process.exit(1);
  }

  const appContext = await NestFactory.createApplicationContext(AppModule);

  try {
    const woodPricingService = appContext.get(WoodPricingService);
    const upserted = await woodPricingService.upsertMany(items);
    console.log(
      `Seeded ${upserted} wood pricing record(s) from ${seedFilePath}`,
    );
  } finally {
    await appContext.close();
  }
}

bootstrap().catch((error) => {
  console.error('Failed to seed wood pricing data:', error);
  process.exit(1);
});
