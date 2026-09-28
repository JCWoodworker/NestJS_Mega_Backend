import { Agent, CursorAgentError } from '@cursor/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import schwabConfig from '@schwab/config/schwab.config';

import { EvidencePacket } from './bot-propose.util';

const NEST_FORBIDDEN = [
  'bot-execution.service.ts',
  'auth/',
  'orders/',
  'streaming/',
  'migrations/',
];

const FE_ALLOWED = ['src/components/bot/', 'src/types/', 'nestjs-notes.md'];

/**
 * Opens a branch and a pull request only when the packet is actionable and
 * the agent flag is on. Never commits to main. Never arms BOT_LIVE.
 */
@Injectable()
export class BotProposeAgentService {
  private readonly logger = new Logger(BotProposeAgentService.name);

  constructor(
    @Inject(schwabConfig.KEY)
    private readonly config: ConfigType<typeof schwabConfig>,
  ) {}

  async launch(
    packet: EvidencePacket,
  ): Promise<{ status: string; detail?: string }> {
    if (!this.config.botProposeAgentEnabled) return { status: 'flag_off' };
    if (!packet.actionable) return { status: 'not_actionable' };
    const apiKey = process.env.CURSOR_API_KEY;
    if (!apiKey) return { status: 'no_api_key' };

    const nestRepo = process.env.BOT_PROPOSE_GITHUB_REPO;
    const feRepo = process.env.BOT_PROPOSE_FE_REPO;
    if (!nestRepo) return { status: 'no_repo' };

    const repos = [{ url: nestRepo, startingRef: 'main' }];
    const wantsFe = packet.allowedPaths.some((path) =>
      FE_ALLOWED.some((prefix) => path.startsWith(prefix)),
    );
    if (wantsFe && feRepo) repos.push({ url: feRepo, startingRef: 'main' });

    const prompt = [
      'You are opening a pull request for a paper-bot settings review.',
      'Commit only on your branch. Do not push to main. Do not merge.',
      'Do not arm BOT_LIVE or edit order placement, auth, or the kill switch.',
      `Do not touch: ${NEST_FORBIDDEN.join(', ')}.`,
      `Allowed paths: ${packet.allowedPaths.join(', ') || 'bot-reports/'}.`,
      'Write bot-reports/weekly/' +
        packet.weekEndingEt +
        '-week.md describing the patch. Do not invent a different patch.',
      JSON.stringify(packet),
    ].join('\n');

    try {
      const result = await Agent.prompt(prompt, {
        apiKey,
        model: { id: 'composer-2.5' },
        cloud: { repos, autoCreatePR: true },
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
      const kind = err instanceof CursorAgentError ? 'startup' : 'sdk_unavailable';
      this.logger.error(`propose agent ${kind}: ${message}`);
      return { status: kind, detail: message };
    }
  }
}
