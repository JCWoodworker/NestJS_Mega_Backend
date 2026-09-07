import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  HandcuffSuggestion,
  HealthResponse,
  InjuryStatus,
  LeverageFlag,
  MatchupResponse,
  Player,
  PositionalDifferential,
  RosterResponse,
  ScheduleResponse,
  StandingsResponse,
  WaiversResponse,
} from './dto/fantasy.types';
import { YahooMcpClientService } from './mcp/yahoo-mcp-client.service';
import {
  mockMatchup,
  mockRoster,
  mockSchedule,
  mockStandings,
  mockWaivers,
} from './mocks/mock-yahoo-data';

const STARTER_SLOTS = new Set([
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'DEF',
  'W/R/T',
  'W/R',
  'W/T',
  'Q/W/R/T',
  'FLEX',
]);

@Injectable()
export class FantasyWarRoomService {
  private readonly logger = new Logger(FantasyWarRoomService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly mcpClient: YahooMcpClientService,
  ) {}

  getHealth(): HealthResponse {
    const useMock = this.isMockMode();
    return {
      ok: true,
      mode: useMock ? 'mock' : 'live',
      leagueId: this.configService.get<string | null>(
        'fantasyWarRoom.leagueId',
        null,
      ),
      mcpConnected: this.mcpClient.isConnected,
    };
  }

  async getRoster(teamKey?: string, week?: number): Promise<RosterResponse> {
    if (this.isMockMode()) {
      const roster = mockRoster();
      if (week) {
        roster.week = week;
      }
      return roster;
    }

    await this.ensureLive();
    const resolvedWeek =
      week ?? (await this.mcpClient.callTool<number>('get_current_week'));
    const resolvedTeamKey =
      teamKey ?? (await this.mcpClient.callTool<string>('get_team_key'));
    const raw = await this.mcpClient.callTool<unknown>('get_team_roster', {
      team_key: resolvedTeamKey,
      week: resolvedWeek,
    });
    return this.normalizeRoster(raw, resolvedWeek, resolvedTeamKey);
  }

  async getMatchup(week?: number): Promise<MatchupResponse> {
    if (this.isMockMode()) {
      const matchup = mockMatchup();
      if (week) {
        matchup.week = week;
      }
      return this.enrichMatchup(matchup);
    }

    await this.ensureLive();
    const resolvedWeek =
      week ?? (await this.mcpClient.callTool<number>('get_current_week'));
    const myTeamKey = await this.mcpClient.callTool<string>('get_team_key');
    const opponentKey = await this.mcpClient.callTool<string>(
      'get_team_matchup',
      {
        team_key: myTeamKey,
        week: resolvedWeek,
      },
    );

    const [myRoster, oppRoster] = await Promise.all([
      this.getRoster(myTeamKey, resolvedWeek),
      this.getRoster(opponentKey, resolvedWeek),
    ]);

    return this.enrichMatchup({
      week: resolvedWeek,
      myTeam: myRoster.team,
      opponent: oppRoster.team,
      myStarters: myRoster.starters,
      myBench: myRoster.bench,
      oppStarters: oppRoster.starters,
      oppBench: oppRoster.bench,
      positionalDifferentials: [],
      leverageFlags: [],
    });
  }

  async getWaivers(
    position?: string,
    systems?: string[],
  ): Promise<WaiversResponse> {
    if (this.isMockMode()) {
      const waivers = mockWaivers();
      const matchup = this.enrichMatchup(mockMatchup());
      waivers.handcuffBlocks = this.buildHandcuffBlocks(
        matchup,
        waivers.freeAgents.concat(waivers.waiverPlayers),
      );
      return this.filterWaivers(waivers, position, systems);
    }

    await this.ensureLive();
    const [freeAgents, waiverPlayers, matchup] = await Promise.all([
      this.mcpClient
        .callTool<unknown>('get_free_agents', {
          position: position || undefined,
        })
        .then((raw) => this.normalizePlayers(raw)),
      this.mcpClient
        .callTool<unknown>('get_waivers')
        .then((raw) => this.normalizePlayers(raw)),
      this.getMatchup(),
    ]);

    const response: WaiversResponse = {
      freeAgents,
      waiverPlayers,
      targetedSystems: systems?.length
        ? systems
        : ['DEN', 'GB', 'SF', 'NE'],
      handcuffBlocks: this.buildHandcuffBlocks(
        matchup,
        freeAgents.concat(waiverPlayers),
      ),
    };

    return this.filterWaivers(response, position, systems);
  }

  async getSchedule(weeksAhead = 3): Promise<ScheduleResponse> {
    if (this.isMockMode()) {
      return mockSchedule();
    }

    await this.ensureLive();
    // Live schedule enrichment is limited by MCP surface; fall back to roster-derived skeleton
    // and mock-quality placeholders until richer schedule tools are available.
    const week = await this.mcpClient.callTool<number>('get_current_week');
    const roster = await this.getRoster(undefined, week);
    const weeks = Array.from({ length: weeksAhead }, (_, i) => week + i);
    const myPlayers = roster.starters.flatMap((player) =>
      weeks.map((w) => ({
        week: w,
        playerKey: player.playerKey,
        playerName: player.name,
        position: player.position,
        isBye: false,
        opponent: player.opponent,
        opponentDefRank: undefined,
        softSchedule: false,
      })),
    );

    return {
      weeks,
      myPlayers,
      byeOverlapWeeks: [],
      buyLowTargets: [],
    };
  }

  async getStandings(): Promise<StandingsResponse> {
    if (this.isMockMode()) {
      return mockStandings();
    }

    await this.ensureLive();
    const raw = await this.mcpClient.callTool<unknown>('get_league_standings');
    return this.normalizeStandings(raw);
  }

  enrichMatchup(matchup: MatchupResponse): MatchupResponse {
    const positionalDifferentials = this.computePositionalDifferentials(
      matchup.myStarters,
      matchup.oppStarters,
    );
    const leverageFlags = this.computeLeverageFlags(
      matchup.myStarters,
      matchup.oppStarters,
    );

    matchup.myTeam.projectedTotal = this.sumProjected(matchup.myStarters);
    matchup.opponent.projectedTotal = this.sumProjected(matchup.oppStarters);

    return {
      ...matchup,
      positionalDifferentials,
      leverageFlags,
    };
  }

  private isMockMode(): boolean {
    return this.configService.get<boolean>('fantasyWarRoom.useMock', true);
  }

  private async ensureLive(): Promise<void> {
    if (!this.mcpClient.isConnected) {
      try {
        await this.mcpClient.connect();
      } catch (error) {
        this.logger.error((error as Error).message);
        throw new ServiceUnavailableException(
          'Yahoo Fantasy MCP is unavailable. Enable FANTASY_WAR_ROOM_USE_MOCK=true or fix MCP auth.',
        );
      }
    }
  }

  private sumProjected(players: Player[]): number {
    return Number(
      players
        .reduce((sum, player) => sum + (player.projectedPoints || 0), 0)
        .toFixed(1),
    );
  }

  private computePositionalDifferentials(
    mine: Player[],
    opp: Player[],
  ): PositionalDifferential[] {
    const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'W/R/T'];
    return positions
      .map((position) => {
        const myPoints = this.sumProjected(
          mine.filter((p) => p.selectedPosition === position || p.position === position),
        );
        const oppPoints = this.sumProjected(
          opp.filter((p) => p.selectedPosition === position || p.position === position),
        );
        if (myPoints === 0 && oppPoints === 0) {
          return null;
        }
        return {
          position,
          myPoints,
          oppPoints,
          differential: Number((myPoints - oppPoints).toFixed(1)),
        };
      })
      .filter((row): row is PositionalDifferential => row !== null);
  }

  private computeLeverageFlags(
    mine: Player[],
    opp: Player[],
  ): LeverageFlag[] {
    const flags: LeverageFlag[] = [];
    const myQbs = mine.filter((p) => p.position === 'QB');
    const oppDefs = opp.filter((p) => p.position === 'DEF');
    const oppQbs = opp.filter((p) => p.position === 'QB');
    const myDefs = mine.filter((p) => p.position === 'DEF');

    for (const qb of myQbs) {
      for (const def of oppDefs) {
        if (qb.nflTeam && def.nflTeam && qb.nflTeam === def.nflTeam) {
          flags.push({
            type: 'negative_correlation',
            severity: 'high',
            message: `You start ${qb.name} (${qb.nflTeam}) against their ${def.nflTeam} DEF — correlated downside.`,
            myPlayerKey: qb.playerKey,
            relatedPlayerKey: def.playerKey,
          });
        }
      }
    }

    for (const qb of oppQbs) {
      for (const def of myDefs) {
        if (qb.nflTeam && def.nflTeam && qb.nflTeam === def.nflTeam) {
          flags.push({
            type: 'negative_correlation',
            severity: 'medium',
            message: `Their ${qb.name} faces your ${def.nflTeam} DEF — your DEF score trades off against their QB.`,
            myPlayerKey: def.playerKey,
            relatedPlayerKey: qb.playerKey,
          });
        }
      }
    }

    return flags;
  }

  private buildHandcuffBlocks(
    matchup: MatchupResponse,
    available: Player[],
  ): HandcuffSuggestion[] {
    const injured = [...matchup.oppStarters, ...matchup.oppBench].filter(
      (player) => player.injuryStatus === 'Q' || player.injuryStatus === 'D' || player.injuryStatus === 'O',
    );

    const suggestions: HandcuffSuggestion[] = [];
    for (const injuredPlayer of injured) {
      const backups = available.filter(
        (fa) =>
          fa.nflTeam === injuredPlayer.nflTeam &&
          this.samePositionGroup(fa.position, injuredPlayer.position) &&
          fa.playerKey !== injuredPlayer.playerKey,
      );
      for (const backup of backups) {
        suggestions.push({
          injuredPlayer,
          injuredOnTeamKey: matchup.opponent.teamKey,
          injuredOnTeamName: matchup.opponent.name,
          backup,
          reason: `Block ${matchup.opponent.name}: ${injuredPlayer.name} is ${injuredPlayer.injuryStatus}; stash ${backup.name}.`,
        });
      }
    }
    return suggestions;
  }

  private samePositionGroup(a: string, b: string): boolean {
    const group = (pos: string) => {
      if (['RB'].includes(pos)) return 'RB';
      if (['WR'].includes(pos)) return 'WR';
      if (['TE'].includes(pos)) return 'TE';
      if (['QB'].includes(pos)) return 'QB';
      return pos;
    };
    return group(a) === group(b);
  }

  private filterWaivers(
    waivers: WaiversResponse,
    position?: string,
    systems?: string[],
  ): WaiversResponse {
    const systemSet = systems?.length
      ? new Set(systems.map((s) => s.toUpperCase()))
      : null;

    const filterPlayers = (players: Player[]) =>
      players.filter((player) => {
        if (position && player.position !== position.toUpperCase()) {
          return false;
        }
        if (systemSet && !systemSet.has(player.nflTeam.toUpperCase())) {
          return false;
        }
        return true;
      });

    return {
      ...waivers,
      freeAgents: filterPlayers(waivers.freeAgents),
      waiverPlayers: filterPlayers(waivers.waiverPlayers),
      targetedSystems: systems?.length
        ? systems
        : waivers.targetedSystems,
    };
  }

  private normalizeRoster(
    raw: unknown,
    week: number,
    teamKey: string,
  ): RosterResponse {
    const players = this.normalizePlayers(raw);
    const starters = players.filter((p) =>
      STARTER_SLOTS.has(p.selectedPosition),
    );
    const bench = players.filter((p) => !STARTER_SLOTS.has(p.selectedPosition));
    const teamName =
      (raw as { name?: string; team_name?: string })?.name ||
      (raw as { team_name?: string })?.team_name ||
      'My Team';

    return {
      week,
      team: {
        teamKey,
        name: teamName,
        projectedTotal: this.sumProjected(starters),
      },
      starters,
      bench,
    };
  }

  private normalizePlayers(raw: unknown): Player[] {
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { players?: unknown[] })?.players)
        ? (raw as { players: unknown[] }).players
        : Array.isArray((raw as { roster?: unknown[] })?.roster)
          ? (raw as { roster: unknown[] }).roster
          : [];

    return list.map((item, index) => this.normalizePlayer(item, index));
  }

  private normalizePlayer(raw: unknown, index: number): Player {
    const row = (raw || {}) as Record<string, unknown>;
    return {
      playerKey: String(row.player_key || row.playerKey || `unknown-${index}`),
      name: String(row.name || row.player_name || 'Unknown'),
      position: String(row.position || row.display_position || 'BN'),
      selectedPosition: String(
        row.selected_position || row.selectedPosition || row.position || 'BN',
      ),
      nflTeam: String(row.editorial_team_abbr || row.nflTeam || row.team || ''),
      opponent: row.opponent ? String(row.opponent) : undefined,
      projectedPoints: Number(row.projected_points || row.projectedPoints || 0),
      actualPoints:
        row.actual_points !== undefined || row.actualPoints !== undefined
          ? Number(row.actual_points ?? row.actualPoints)
          : undefined,
      injuryStatus: this.normalizeInjury(
        row.status || row.injury_status || row.injuryStatus,
      ),
      percentOwned:
        row.percent_owned !== undefined || row.percentOwned !== undefined
          ? Number(row.percent_owned ?? row.percentOwned)
          : undefined,
    };
  }

  private normalizeInjury(value: unknown): InjuryStatus {
    if (!value) {
      return null;
    }
    const status = String(value).toUpperCase();
    if (['Q', 'D', 'O', 'P', 'IR'].includes(status)) {
      return status as InjuryStatus;
    }
    if (status.includes('QUESTION')) return 'Q';
    if (status.includes('DOUBT')) return 'D';
    if (status.includes('OUT')) return 'O';
    if (status.includes('IR')) return 'IR';
    return null;
  }

  private normalizeStandings(raw: unknown): StandingsResponse {
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { standings?: unknown[] })?.standings)
        ? (raw as { standings: unknown[] }).standings
        : [];

    return {
      standings: list.map((item, index) => {
        const row = (item || {}) as Record<string, unknown>;
        return {
          rank: Number(row.rank || index + 1),
          teamKey: String(row.team_key || row.teamKey || `team-${index}`),
          name: String(row.name || row.team_name || 'Team'),
          wins: Number(row.wins || 0),
          losses: Number(row.losses || 0),
          ties: Number(row.ties || 0),
          pointsFor: Number(row.points_for || row.pointsFor || 0),
        };
      }),
    };
  }
}
