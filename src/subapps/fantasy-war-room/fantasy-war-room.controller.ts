import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Auth } from '@iam/decorators/auth.decorator';
import { AuthType } from '@iam/enums/auth-type.enum';

import { FantasyWarRoomService } from './fantasy-war-room.service';

@Auth(AuthType.None)
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller()
export class FantasyWarRoomController {
  constructor(private readonly fantasyWarRoomService: FantasyWarRoomService) {}

  @Get('health')
  getHealth() {
    return this.fantasyWarRoomService.getHealth();
  }

  @Get('roster')
  getRoster(
    @Query('teamKey') teamKey?: string,
    @Query('week') week?: string,
  ) {
    return this.fantasyWarRoomService.getRoster(
      teamKey,
      week ? Number(week) : undefined,
    );
  }

  @Get('matchup')
  getMatchup(@Query('week') week?: string) {
    return this.fantasyWarRoomService.getMatchup(
      week ? Number(week) : undefined,
    );
  }

  @Get('waivers')
  getWaivers(
    @Query('position') position?: string,
    @Query('systems') systems?: string,
  ) {
    const systemList = systems
      ? systems
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : undefined;
    return this.fantasyWarRoomService.getWaivers(position, systemList);
  }

  @Get('schedule')
  getSchedule(@Query('weeksAhead') weeksAhead?: string) {
    return this.fantasyWarRoomService.getSchedule(
      weeksAhead ? Number(weeksAhead) : 3,
    );
  }

  @Get('standings')
  getStandings() {
    return this.fantasyWarRoomService.getStandings();
  }
}
