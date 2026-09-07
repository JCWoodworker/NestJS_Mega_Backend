import { registerAs } from '@nestjs/config';

export default registerAs('fantasyWarRoom', () => ({
  useMock: process.env.FANTASY_WAR_ROOM_USE_MOCK !== 'false',
  leagueId: process.env.YAHOO_LEAGUE_ID || null,
  clientId: process.env.YAHOO_CLIENT_ID || null,
  clientSecret: process.env.YAHOO_CLIENT_SECRET || null,
  oauth2File: process.env.YAHOO_OAUTH2_FILE || 'oauth2.json',
  mcpCommand: process.env.YAHOO_MCP_COMMAND || 'python3',
  mcpArgs: (process.env.YAHOO_MCP_ARGS || '-m,yahoo_fantasy_mcp')
    .split(',')
    .map((arg) => arg.trim())
    .filter(Boolean),
  mcpCwd: process.env.YAHOO_MCP_CWD || process.cwd(),
}));
