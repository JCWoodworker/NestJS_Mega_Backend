// eslint-disable-next-line import/no-unresolved -- resolved via package.json "exports" subpath, which the eslint-import resolver doesn't follow, but tsc/Node resolve it correctly.
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';

import { Auth } from '@iam/decorators/auth.decorator';
import { AuthType } from '@iam/enums/auth-type.enum';

import { McpProviderService } from './mcp-provider.service';

@Auth(AuthType.None)
@Controller('mcp')
export class McpController {
  constructor(private readonly mcpProviderService: McpProviderService) {}

  // MCP is stateless here (sessionIdGenerator: undefined), so a single ChatGPT
  // turn can fan out into several JSON-RPC requests (initialize, tools/list,
  // tools/call, ...). 60/min gives headroom for normal multi-turn usage from
  // one client while still bounding scripted abuse, well above the app's
  // generic 10/min default guard.
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post()
  async handlePost(@Req() req: Request, @Res() res: Response): Promise<void> {
    const server = this.mcpProviderService.buildServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on('close', () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  @Get()
  async handleGet(@Res() res: Response): Promise<void> {
    res.status(405).json({
      error: 'Method not allowed. This MCP server is stateless; use POST.',
    });
  }
}
