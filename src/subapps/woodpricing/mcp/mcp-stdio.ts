// eslint-disable-next-line import/no-unresolved -- resolved via package.json "exports" subpath, which the eslint-import resolver doesn't follow, but tsc/Node resolve it correctly.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { NestFactory } from '@nestjs/core';

import { McpProviderService } from './mcp-provider.service';
import { AppModule } from '../../../app.module';

/**
 * Standalone MCP entrypoint for local usage (e.g. Cursor's MCP client config).
 * Boots a Nest application context (no HTTP listener) to get DI access to
 * McpProviderService/WoodPricingService/TypeORM, then serves the same
 * calculate_project_cost tool over stdio instead of Streamable HTTP.
 *
 * Run via: yarn mcp:stdio
 */
async function bootstrap() {
  const appContext = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  const mcpProviderService = appContext.get(McpProviderService);
  const server = mcpProviderService.buildServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
}

bootstrap().catch((error) => {
  console.error('Failed to start woodpricing MCP stdio server:', error);
  process.exit(1);
});
