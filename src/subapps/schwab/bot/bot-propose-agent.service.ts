import { Agent, CursorAgentError } from '@cursor/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import schwabConfig from '@schwab/config/schwab.config';

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

    // No trades means nothing to review. Note this is the only bar: a losing
    // week is the *input* to the review, and the capped-settings gates in
    // `packet.blockedReasons` are evidence the agent weighs, not a veto. The
    // loop this replaced refused to look at exactly the weeks worth looking at.
    if (!packet.dossier.sessions.length) return { status: 'no_sessions' };

    const apiKey = process.env.CURSOR_API_KEY;
    if (!apiKey) return { status: 'no_api_key' };

    const nestRepo = process.env.BOT_PROPOSE_GITHUB_REPO;
    if (!nestRepo) return { status: 'no_repo' };

    const fixtureToken = process.env.BOT_FIXTURE_TOKEN;
    const fixtureUrl = process.env.BOT_FIXTURE_URL;

    try {
      const result = await Agent.prompt(this.buildPrompt(packet, fixtureUrl), {
        apiKey,
        model: { id: process.env.BOT_PROPOSE_MODEL ?? 'composer-2.5' },
        cloud: {
          repos: [{ url: nestRepo, startingRef: 'main' }],
          autoCreatePR: true,
          // Per-session, encrypted at rest, deleted with the agent. The token
          // only reaches a read-only market-data endpoint.
          envVars:
            fixtureToken && fixtureUrl
              ? { BOT_FIXTURE_TOKEN: fixtureToken, BOT_FIXTURE_URL: fixtureUrl }
              : undefined,
        },
      });

      const prUrl = result.git?.branches.find((branch) => branch.prUrl)?.prUrl;
      this.logger.log(
        `propose agent ${result.status}: ${result.id}${prUrl ? ` ${prUrl}` : ''}`,
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

  private buildPrompt(packet: ProposePacket, fixtureUrl?: string): string {
    const backtest = fixtureUrl
      ? `yarn bot:backtest --url "$BOT_FIXTURE_URL" --token "$BOT_FIXTURE_TOKEN" --from ${packet.dossier.sessions[0].etDateKey}`
      : 'yarn bot:backtest --fixture <file>  # no fixture endpoint configured this run';

    return [
      '# Weekly improvement review',
      '',
      'You are reviewing the house paper trainer, the V2 book under bot-v2.',
      'It is not a user\'s personal bot. It runs the enabled entry rules',
      '(VWAP_PULLBACK and ORB_5M unless the dossier says otherwise), combined',
      'with ANY (first to fire wins) or CONFIRMING (all must agree). It holds',
      'one position at a time and exits on premium stop, premium target, a',
      'trailing stop, or ATR-derived underlying levels.',
      '',
      '## Your job',
      '',
      'Work out where the strategy is actually failing, then change it. The',
      'failure may be in the entry rules, the strike filters, the exit levels,',
      'the gating, or the position sizing — the evidence decides, not a',
      'preference for whichever is easiest to edit.',
      '',
      'Research is part of the job. Search for how comparable intraday and 0DTE',
      'approaches handle whatever failure you identify, and cite what you used.',
      'Prefer sources that describe a mechanism over ones that assert a result.',
      '',
      '## Evidence',
      '',
      '`rapidScalpReplay` rescores those same entries with a fee-aware exit',
      'of about 1% of the money in the trade, or the 25% premium stop if that',
      'prints first. Read it as an exit question only. It does not include',
      'trades a shorter cooldown would have opened, and it is not a reason to',
      'add a live rapid-scalp mode or to change cooldown. Entry-rule edits',
      'still need the rest of the dossier.',
      '',
      'The dossier below covers the trainer book only. `strategyPerformance`',
      'splits results by rule and direction. `timeOfDay` is the same split',
      'inside each 30-minute ET entry window (`strategies` on each bucket),',
      'plus `exits` so a window of targets and a window of premium stops stay',
      'apart when the setup tag is the same. `skipCensus` counts setups the',
      'gates refused, which is the half of the record outcomes alone cannot',
      'show. `excursion` distinguishes entries that never worked from exits',
      'that gave back a winner. `sessionContext` describes the tape each day,',
      'so a rule losing on a chop day and on a trend day can be told apart.',
      '',
      '```json',
      JSON.stringify(packet.dossier),
      '```',
      '',
      'The capped-settings replay ran separately and reports:',
      `actionable=${packet.actionable}, blocked=[${packet.blockedReasons.join(', ') || 'none'}],`,
      `patch=${JSON.stringify(packet.patch)}, holdout delta/trade=${packet.holdoutDeltaPerTrade},`,
      `bootstrap 95% lower bound=${packet.bootstrapLowerBound}, stable sessions=${packet.stableSessions}.`,
      '',
      'Read that as evidence about one narrow question — whether a two-key,',
      'capped settings nudge survives walk-forward and bootstrap — and not as',
      'permission. `actionable=false` means that particular nudge did not clear',
      'the bar. It says nothing about whether the strategy itself should change.',
      '',
      '## Validate before you claim anything',
      '',
      `Run the replay on \`main\` for a baseline, then again on your branch:`,
      '',
      '```',
      backtest,
      '```',
      '',
      'It replays recorded bars and option-chain snapshots through the same',
      'functions production uses. Two limits you must respect and repeat:',
      '',
      '- It reports `snapshotIntervalSec` and `lowFidelity`. The live exit loop',
      '  runs on every tick, so a stop touched and recovered between two samples',
      '  is invisible. That bias runs one way: coarse runs understate stop-outs',
      '  and flatter any candidate. If `lowFidelity` is true, say so wherever',
      '  you quote a number, and do not compare it against live P&L.',
      '- Sessions before 2026-09-28 were sampled once a minute; later ones every',
      '  five seconds. Do not pool them without saying which is which.',
      '',
      '## Rules',
      '',
      `- Work on your own branch. Never commit to main, never merge.`,
      `- You may edit: ${ALLOWED_PATHS.join(', ')}.`,
      `- You may never edit: ${FORBIDDEN_PATHS.join(', ')}.`,
      '- Never arm or enable BOT_LIVE, and never weaken the kill switch, the',
      '  lockout, the socket-loss flatten, or the minimum-equity refusal. CI',
      '  fails the build if you do.',
      '- A new setting needs its column, its DTO bounds and its migration in the',
      '  same change, or it cannot ship.',
      '- Keep the bot 0DTE-only and paper-only.',
      '',
      '## Deliverable',
      '',
      `Write \`bot-reports/weekly/${packet.weekEndingEt}-week.md\` and open one pull`,
      'request. The body must carry, in this order: the failure you identified',
      'and the specific numbers that show it; what your research found and the',
      'sources; the change you made and why it addresses that failure; baseline',
      'versus candidate replay results with the fidelity caveat; and what would',
      'falsify it.',
      '',
      'If the evidence does not support a change, say that plainly and open a',
      'pull request containing only the report. A week that does not justify a',
      'change is a real finding. Inventing a plausible-looking patch to have',
      'something to show is the one outcome that makes this loop worse than',
      'useless, because it will be reviewed by someone trusting that the',
      'numbers meant something.',
    ].join('\n');
  }
}
