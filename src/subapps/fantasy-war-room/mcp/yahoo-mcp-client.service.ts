// eslint-disable-next-line import/no-unresolved -- package exports subpath
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
// eslint-disable-next-line import/no-unresolved -- package exports subpath
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class YahooMcpClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(YahooMcpClientService.name);
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private connected = false;

  constructor(private readonly configService: ConfigService) {}

  get isConnected(): boolean {
    return this.connected;
  }

  async onModuleInit(): Promise<void> {
    const useMock = this.configService.get<boolean>(
      'fantasyWarRoom.useMock',
      true,
    );
    if (useMock) {
      this.logger.log('Fantasy War Room MCP client skipped (mock mode)');
      return;
    }

    try {
      await this.connect();
    } catch (error) {
      this.logger.error(
        `Failed to connect Yahoo Fantasy MCP: ${(error as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    const command = this.configService.get<string>(
      'fantasyWarRoom.mcpCommand',
      'python3',
    );
    const args = this.configService.get<string[]>('fantasyWarRoom.mcpArgs', [
      '-m',
      'yahoo_fantasy_mcp',
    ]);
    const cwd = this.configService.get<string>(
      'fantasyWarRoom.mcpCwd',
      process.cwd(),
    );
    const oauth2File = this.configService.get<string>(
      'fantasyWarRoom.oauth2File',
      'oauth2.json',
    );
    const leagueId = this.configService.get<string | null>(
      'fantasyWarRoom.leagueId',
      null,
    );
    const clientId = this.configService.get<string | null>(
      'fantasyWarRoom.clientId',
      null,
    );
    const clientSecret = this.configService.get<string | null>(
      'fantasyWarRoom.clientSecret',
      null,
    );

    const env: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      ),
    };

    if (leagueId) {
      env.YAHOO_LEAGUE_ID = leagueId;
    }
    if (clientId) {
      env.YAHOO_CLIENT_ID = clientId;
    }
    if (clientSecret) {
      env.YAHOO_CLIENT_SECRET = clientSecret;
    }

    const mcpArgs = [...args];
    if (oauth2File && !mcpArgs.includes('--oauth2-file')) {
      mcpArgs.push('--oauth2-file', oauth2File);
    }

    this.transport = new StdioClientTransport({
      command,
      args: mcpArgs,
      cwd,
      env,
      stderr: 'pipe',
    });

    this.client = new Client({
      name: 'fantasy-war-room-nest',
      version: '1.0.0',
    });

    await this.client.connect(this.transport);
    this.connected = true;
    this.logger.log('Connected to Yahoo Fantasy MCP over stdio');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    try {
      await this.client?.close();
    } catch {
      // ignore close errors during shutdown
    }
    try {
      await this.transport?.close();
    } catch {
      // ignore
    }
    this.client = null;
    this.transport = null;
  }

  async callTool<T = unknown>(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    if (!this.client || !this.connected) {
      throw new Error('Yahoo Fantasy MCP client is not connected');
    }

    const result = await this.client.callTool({
      name,
      arguments: args,
    });

    if (result.isError) {
      const message = this.extractText(result.content) || `Tool ${name} failed`;
      throw new Error(message);
    }

    const structured = (result as { structuredContent?: unknown })
      .structuredContent;
    if (structured !== undefined) {
      return structured as T;
    }

    const text = this.extractText(result.content);
    if (!text) {
      return result as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  private extractText(content: unknown): string {
    if (!Array.isArray(content)) {
      return '';
    }
    return content
      .filter(
        (part): part is { type: string; text: string } =>
          !!part &&
          typeof part === 'object' &&
          (part as { type?: string }).type === 'text' &&
          typeof (part as { text?: string }).text === 'string',
      )
      .map((part) => part.text)
      .join('\n');
  }
}
