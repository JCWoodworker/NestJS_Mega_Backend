// eslint-disable-next-line import/no-unresolved -- resolved via package.json "exports" subpath, which the eslint-import resolver doesn't follow, but tsc/Node resolve it correctly.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { MeasurementType } from '../enums/measurement-type.enum';
import { WoodPricingService } from '../wood-pricing.service';

@Injectable()
export class McpProviderService {
  constructor(private readonly woodPricingService: WoodPricingService) {}

  buildServer(): McpServer {
    const server = new McpServer({
      name: 'woodpricing-mcp',
      version: '1.0.0',
    });

    server.registerTool(
      'calculate_project_cost',
      {
        title: 'Calculate Project Cost',
        description:
          'Calculates the material cost for a woodworking project given a wood species, ' +
          'quantity, measurement type, and (when applicable) board thickness. Queries the ' +
          'live wood pricing database for the exact unit price.',
        inputSchema: {
          species: z
            .string()
            .describe(
              'Wood species, e.g. "Black Walnut", "Maple - Hard Maple", "Oak - White Oak - Quarter Sawn".',
            ),
          quantity: z
            .number()
            .positive()
            .describe(
              'Quantity of material needed, in the unit implied by measurementType.',
            ),
          measurementType: z
            .nativeEnum(MeasurementType)
            .describe('Unit of measurement for pricing.'),
          thickness: z
            .string()
            .optional()
            .describe(
              'Nominal board thickness, e.g. "4/4", "8/4". Required whenever the species ' +
                'has more than one stocked thickness; omit only when the species has a ' +
                'single stocked thickness.',
            ),
        },
      },
      async ({ species, quantity, measurementType, thickness }) => {
        try {
          const result = await this.woodPricingService.calculateCost(
            species,
            quantity,
            measurementType,
            thickness,
          );

          const thicknessLabel = result.thickness
            ? ` (${result.thickness})`
            : '';

          return {
            content: [
              {
                type: 'text' as const,
                text: `${result.species}: ${result.quantity} ${
                  result.measurementType
                }${thicknessLabel} x $${result.unitPrice.toFixed(
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

    return server;
  }
}
