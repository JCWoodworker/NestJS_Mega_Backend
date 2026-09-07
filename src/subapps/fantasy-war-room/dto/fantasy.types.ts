export type InjuryStatus = 'Q' | 'D' | 'O' | 'P' | 'IR' | null;

export interface Player {
  playerKey: string;
  name: string;
  position: string;
  selectedPosition: string;
  nflTeam: string;
  opponent?: string;
  projectedPoints: number;
  actualPoints?: number;
  injuryStatus: InjuryStatus;
  percentOwned?: number;
}

export interface TeamSummary {
  teamKey: string;
  name: string;
  managerName?: string;
  projectedTotal: number;
  actualTotal?: number;
}

export interface RosterResponse {
  week: number;
  team: TeamSummary;
  starters: Player[];
  bench: Player[];
}

export interface PositionalDifferential {
  position: string;
  myPoints: number;
  oppPoints: number;
  differential: number;
}

export interface LeverageFlag {
  type: 'negative_correlation';
  severity: 'high' | 'medium' | 'low';
  message: string;
  myPlayerKey: string;
  relatedPlayerKey?: string;
}

export interface MatchupResponse {
  week: number;
  myTeam: TeamSummary;
  opponent: TeamSummary;
  myStarters: Player[];
  oppStarters: Player[];
  myBench: Player[];
  oppBench: Player[];
  positionalDifferentials: PositionalDifferential[];
  leverageFlags: LeverageFlag[];
}

export interface HandcuffSuggestion {
  injuredPlayer: Player;
  injuredOnTeamKey: string;
  injuredOnTeamName: string;
  backup: Player;
  reason: string;
}

export interface WaiversResponse {
  freeAgents: Player[];
  waiverPlayers: Player[];
  handcuffBlocks: HandcuffSuggestion[];
  targetedSystems: string[];
}

export interface ScheduleCell {
  week: number;
  playerKey: string;
  playerName: string;
  position: string;
  isBye: boolean;
  opponent?: string;
  opponentDefRank?: number;
  softSchedule: boolean;
}

export interface ScheduleResponse {
  weeks: number[];
  myPlayers: ScheduleCell[];
  byeOverlapWeeks: number[];
  buyLowTargets: Array<{
    player: Player;
    teamName: string;
    softWeeksAhead: number[];
    reason: string;
  }>;
}

export interface StandingsResponse {
  standings: Array<{
    rank: number;
    teamKey: string;
    name: string;
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
  }>;
}

export interface HealthResponse {
  ok: boolean;
  mode: 'mock' | 'live';
  leagueId: string | null;
  mcpConnected: boolean;
}
