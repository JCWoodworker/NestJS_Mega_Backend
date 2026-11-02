import { Agent, CursorAgentError } from '@cursor/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import schwabConfig from '@schwab/config/schwab.config';

import { SearchWinner } from './bot-propose-search';
import { ProposePacket } from './bot-propose.util';

/**
 * Paths the agent may never touch, whatever the evidence says.
 *
 * Order placement, authentication, streaming and the kill switch are not
 * subject to weekly tuning: a mistake there does not cost a losing trade, it
 * costs the ability to get out of one. The same list is enforced again in CI,
 * because a prompt is guidance and a required check is not.
 */
const FORBIDDEN_PATHS = [
  'src/subapps/schwab/bot/bot-execution.service.ts',
  'src/subapps/schwab/auth/',
  'src/subapps/schwab/orders/',
  'src/subapps/schwab/streaming/',
];

/**
 * Where a strategy change is allowed to land. Wider than the settings-only
 * loop this replaced: a rule that needs its own toggle needs the column and
 * the migration too, or it cannot ship at all.
 */
const ALLOWED_PATHS = [
  'src/subapps/schwab/bot/bot-strategy.util.ts',
  'src/subapps/schwab/bot/bot-strike-selection.util.ts',
  'src/subapps/schwab/bot/bot-exit.util.ts',
  'src/subapps/schwab/bot/bot-analysis.util.ts',
  'src/subapps/schwab/bot/enums/strategy.enum.ts',
  'src/subapps/schwab/bot-v2/bot-v2-engine.service.ts',
  'src/subapps/schwab/bot-v2/entities/bot-v2-settings.entity.ts',
  'src/subapps/schwab/bot-v2/dto/',
  'src/subapps/schwab/bot-v2/migrations/',
  'schwab-frontend-notes.md',
  'bot-reports/',
];

@Injectable()
export class BotProposeAgentService {
  private readonly logger = new Logger(BotProposeAgentService.name);

  constructor(
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
  ) {}

  async launch(
    packet: ProposePacket,
  ): Promise<{ status: string; detail?: string }> {
    if (!this.config.botProposeAgentEnabled) return { status: 'flag_off' };

    // The search already ran inside this process. A week with no winner does
    // not start an agent, so it cannot open a pull request.
    const winner = packet.search?.winner ?? null;
    if (!winner) return { status: 'no_winner' };

    const apiKey = process.env.CURSOR_API_KEY;
    if (!apiKey) return { status: 'no_api_key' };

    const nestRepo = process.env.BOT_PROPOSE_GITHUB_REPO;
    if (!nestRepo) return { status: 'no_repo' };

    const fixtureToken = process.env.BOT_FIXTURE_TOKEN;
    const fixtureUrl = process.env.BOT_FIXTURE_URL;

    try {
      const result = await Agent.prompt(
        this.buildPrompt(packet, winner, fixtureUrl),
        {
          apiKey,
          model: { id: process.env.BOT_PROPOSE_MODEL ?? 'composer-2.5' },
          cloud: {
            repos: [{ url: nestRepo, startingRef: 'main' }],
            // Off. The prompt opens one pull request for the assignment below.
            // A week the search lost never reaches this call.
            autoCreatePR: false,
            envVars:
              fixtureToken && fixtureUrl
                ? {
                    BOT_FIXTURE_TOKEN: fixtureToken,
                    BOT_FIXTURE_URL: fixtureUrl,
                  }
                : undefined,
          },
        },
      );

      const prUrl = result.git?.branches.find((branch) => branch.prUrl)?.prUrl;
      this.logger.log(
        `propose agent ${result.status}: ${result.id}${
          prUrl ? ` ${prUrl}` : ''
        }`,
      );
      if (result.status === 'error') {
        return { status: 'error', detail: result.error?.message ?? result.id };
      }
      return { status: 'launched', detail: prUrl ?? result.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const kind =
        err instanceof CursorAgentError ? 'startup' : 'sdk_unavailable';
      this.logger.error(`propose agent ${kind}: ${message}`);
      return { status: kind, detail: message };
    }
  }

  private buildPrompt(
    packet: ProposePacket,
    winner: SearchWinner,
    fixtureUrl?: string,
  ): string {
    const from =
      packet.search?.searchSessions[0] ??
      packet.dossier.sessions[0]?.etDateKey ??
      packet.weekEndingEt;
    const backtest = fixtureUrl
      ? `yarn bot:backtest --url "$BOT_FIXTURE_URL" --token "$BOT_FIXTURE_TOKEN" --from ${from}`
      : 'yarn bot:backtest --fixture <file>  # no fixture endpoint configured this run';
    const codeChange = winner.kind === 'quiet-days';

    return [
      '# Weekly improvement review',
      '',
      'You are writing up one change that already beat the house trainer on its own tape.',
      `This packet is only the ${packet.book} book.`,
      'The desk is a long single-leg premium buyer. Read bot-reports/research-brief.md',
      'before you edit. A published parameter is not a setting. One assignment.',
      'Do not add a second idea.',
      '',
      '## Assignment',
      '',
      'The search already measured this. Do not pick a different change.',
      '',
      '```json',
      JSON.stringify(winner),
      '```',
      '',
      `Book on the fit sessions: net ${packet.search?.book.search.net}, green days ${packet.search?.book.search.greenDays}.`,
      `Book on the held-out sessions: net ${packet.search?.book.holdout.net}.`,
      'A day the book did not trade is not a green day. Win rate is not the score.',
      '',
      codeChange
        ? [
            'This assignment is the quiet-day filter. Add a trainer gate that refuses',
            'new entries when the 09:30–10:30 ET high-minus-low of spot is at or below',
            `quietCutoffPts (${
              winner.quietCutoffPts ?? 'the value in the assignment'
            }).`,
            'The gate stays off unless that setting is set. Do not change the sell ladder.',
            'Do not turn a rule off in code.',
          ].join('\n')
        : [
            'This assignment is a settings change. Do not edit a strategy formula.',
            'The patch is already on the proposal. Write the report. Merging the pull',
            'request does not write the trainer row. The 09:20 job writes it after the',
            'proposal status is merged. Ladder numbers apply to both bots. A rule list,',
            'cooldown, or entry-window end applies to the trainer only.',
          ].join('\n'),
      '',
      '## Evidence',
      '',
      '```json',
      JSON.stringify({
        searchSessions: packet.search?.searchSessions,
        holdoutSessions: packet.search?.holdoutSessions,
        shouldHave: packet.search?.shouldHave,
        dropCandidates: packet.search?.dropCandidates,
        rules: packet.search?.rules,
      }),
      '```',
      '',
      'The dossier is context for the report. It is not permission to change something else.',
      '',
      '```json',
      JSON.stringify(packet.dossier),
      '```',
      '',
      '## Confirm the assignment',
      '',
      'The backtest command requests one session at a time. Do not put the whole',
      'range in one URL.',
      '',
      '```',
      backtest,
      '```',
      '',
      'Replay the current book, then replay the assignment. A ladder percent maps',
      'onto profitLock: lossCutPct is stopPct, protectArmPct is armPct,',
      'protectFloorPct is floorPct, givebackPct is givebackPct, tightFromPct is',
      'tightFromPct, tightGivebackPct is tightGivebackPct. strategiesEnabled is',
      'the strategies list. It replays the trainer: SPXW chain, 15-second bars,',
      'profit-lock ladder. Quote baseline versus the assignment.',
      'If `lowFidelity` is true, say so wherever you quote a number. Coarse runs',
      'understate stop-outs. If your replay does not beat the book on the fit',
      'sessions without fewer green days, and is not worse on the held-out',
      'sessions, commit nothing.',
      '',
      '## Rules',
      '',
      '- Work on your own branch. Never commit to main, never merge.',
      `- You may edit: ${ALLOWED_PATHS.join(', ')}.`,
      `- You may never edit: ${FORBIDDEN_PATHS.join(', ')}.`,
      '- Never arm or enable BOT_LIVE, and never weaken the kill switch, the',
      '  lockout, the socket-loss flatten, or the minimum-equity refusal.',
      '- Keep the bot paper-only. No spreads, no overnight hold, no weekly.',
      '',
      '## Deliverable',
      '',
      `Write \`bot-reports/weekly/${packet.weekEndingEt}-week.md\` and open one pull`,
      'request for this assignment only. The body carries the fit-session numbers,',
      'the held-out numbers, the source, and what would falsify it.',
      '',
      'If you cannot apply this assignment exactly, change no files and open no',
      'pull request. Inventing a change is worse than reporting that the search',
      'already finished.',
    ].join('\n');
  }
}
