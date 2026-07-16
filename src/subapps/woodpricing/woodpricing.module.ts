import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WoodMaterial } from './entities/wood-material.entity';
import { McpProviderService } from './mcp/mcp-provider.service';
import { McpController } from './mcp/mcp.controller';
import { WoodPricingController } from './wood-pricing.controller';
import { WoodPricingService } from './wood-pricing.service';

@Module({
  imports: [TypeOrmModule.forFeature([WoodMaterial])],
  controllers: [WoodPricingController, McpController],
  providers: [WoodPricingService, McpProviderService],
  exports: [WoodPricingService, McpProviderService],
})
export class WoodpricingModule {}
