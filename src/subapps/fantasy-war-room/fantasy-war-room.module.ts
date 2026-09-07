import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import fantasyWarRoomConfig from './config/fantasy-war-room.config';
import { FantasyWarRoomController } from './fantasy-war-room.controller';
import { FantasyWarRoomService } from './fantasy-war-room.service';
import { YahooMcpClientService } from './mcp/yahoo-mcp-client.service';

@Module({
  imports: [ConfigModule.forFeature(fantasyWarRoomConfig)],
  controllers: [FantasyWarRoomController],
  providers: [FantasyWarRoomService, YahooMcpClientService],
  exports: [FantasyWarRoomService],
})
export class FantasyWarRoomModule {}
