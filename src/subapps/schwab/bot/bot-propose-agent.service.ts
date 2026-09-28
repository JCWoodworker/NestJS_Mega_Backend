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

    const repos = [{ repository: nestRepo, ref: 'main' }];
    const wantsFe = packet.allowedPaths.some((path) =>
      FE_ALLOWED.some((prefix) => path.startsWith(prefix)),
    );
    if (wantsFe && feRepo) repos.push({ repository: feRepo, ref: 'main' });

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
      const importer = new Function(
        'specifier',
        'return import(specifier)',
      ) as (specifier: string) => Promise<{
        Agent: {
          prompt: (
            prompt: string,
            options: Record<string, unknown>,
          ) => Promise<{ status?: string; id?: string }>;
        };
      }>;
      const sdk = await importer('@cursor/sdk');
      const result = await sdk.Agent.prompt(prompt, {
        apiKey,
        cloud: { repos, autoCreatePR: true },
      });
      this.logger.log(`propose agent launched: ${result.id ?? result.status}`);
      return { status: 'launched', detail: result.id };
    } catch (err) {
      this.logger.error(`propose agent skipped: ${(err as Error).message}`);
      return { status: 'sdk_unavailable', detail: (err as Error).message };
    }
  }
}
