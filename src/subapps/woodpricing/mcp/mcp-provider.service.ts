// eslint-disable-next-line import/no-unresolved -- resolved via package.json "exports" subpath, which the eslint-import resolver doesn't follow, but tsc/Node resolve it correctly.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { WoodPricingService } from '../wood-pricing.service';

@Injectable()
export class McpProviderService {
  constructor(private readonly woodPricingService: WoodPricingService) {}

  buildServer(): McpServer {
    const server = new McpServer({
      name: 'woodpricing-mcp',
      version: '1.0.0',
    });

    this.registerGetMaterialCatalog(server);
    this.registerCalculateProjectCost(server);

    return server;
  }

  private registerGetMaterialCatalog(server: McpServer): void {
    server.registerTool(
      'get_material_catalog',
      {
        title: 'Get Material Catalog',
        description:
          'Returns the full wood pricing catalog: every species, its measurement type, ' +
          'and every stocked thickness with its unit price. Call this first to discover ' +
          'valid (species, thickness) combinations before calling calculate_project_cost.',
      },
      async () => {
        const catalog = await this.woodPricingService.getMaterialCatalog();

        return {
          content: [
            {
              type: 'text' as const,
              text: `Returned pricing for ${catalog.length} species/measurement-type group(s).`,
            },
          ],
          structuredContent: { materials: catalog },
        };
      },
    );
  }

  private registerCalculateProjectCost(server: McpServer): void {
    server.registerTool(
      'calculate_project_cost',
      {
        title: 'Calculate Project Cost',
        description:
          'Calculates the material cost for a woodworking project given a wood species, ' +
          'a board thickness, and a quantity. species and thickness must come from ' +
          "get_material_catalog's output. Queries the live wood pricing database for " +
          'the exact unit price.',
        inputSchema: {
          species: z
            .string()
            .describe(
              'Wood species exactly as returned by get_material_catalog, e.g. ' +
                '"Black Walnut", "Maple - Hard Maple", "Oak - White Oak - Quarter Sawn".',
            ),
          thickness: z
            .string()
            .describe(
              "Nominal board thickness exactly as returned in get_material_catalog's " +
                'availableThicknesses for this species, e.g. "4/4", "8/4".',
            ),
          quantity: z
            .number()
            .positive()
            .describe(
              "Quantity of material needed, in the unit implied by the species' measurementType.",
            ),
        },
      },
      async ({ species, thickness, quantity }) => {
        try {
          const result = await this.woodPricingService.calculateCost(
            species,
            thickness,
            quantity,
          );

          return {
            content: [
              {
                type: 'text' as const,
                text: `${result.species}: ${result.quantity} ${
                  result.measurementType
                } (${result.thickness}) x $${result.unitPrice.toFixed(
                  2,
                )} = $${result.totalCost.toFixed(2)}`,
              },
            ],
            structuredContent: result,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown error occurred';

          return {
            isError: true,
            content: [{ type: 'text' as const, text: message }],
          };
        }
      },
    );
  }
}
