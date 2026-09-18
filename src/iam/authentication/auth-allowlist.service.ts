import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Users } from '@users/entities/users.entity';

import authConfig from '@config/auth.config';

import { AuthAllowedEmail } from '@iam/entities/auth-allowed-email.entity';

@Injectable()
export class AuthAllowlistService implements OnModuleInit {
  private readonly logger = new Logger(AuthAllowlistService.name);

  constructor(
    @InjectRepository(AuthAllowedEmail)
    private readonly allowedRepository: Repository<AuthAllowedEmail>,
    @Inject(authConfig.KEY)
    private readonly authConfiguration: ConfigType<typeof authConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedBootstrapIfEmpty();
  }

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async isEmailAllowed(email: string): Promise<boolean> {
    const normalized = this.normalizeEmail(email);
    const row = await this.allowedRepository.findOneBy({ email: normalized });
    return row != null;
  }

  /**
   * Gate for sign-up, sign-in and refresh.
   *
   * With `AUTH_OPEN_SIGNUP` off this fails closed on the allowlist — the
   * original invite-only posture. With it on the allowlist becomes a no-op
   * and anyone may authenticate.
   *
   * The `is_locked` check applies either way, so an individual account can
   * always be shut off without closing sign-up for everybody.
   *
   * Generic 401 in both cases, to avoid leaking which addresses exist.
   */
  async assertCanAuthenticate(
    email: string,
    user?: Users | null,
  ): Promise<void> {
    if (user?.isLocked) {
      throw new UnauthorizedException();
    }
    if (this.authConfiguration.openSignup) {
      return;
    }
    if (!(await this.isEmailAllowed(email))) {
      throw new UnauthorizedException();
    }
  }

  async list(): Promise<AuthAllowedEmail[]> {
    return this.allowedRepository.find({ order: { email: 'ASC' } });
  }

  async add(
    email: string,
    opts: { createdBy?: string | null; note?: string | null } = {},
  ): Promise<AuthAllowedEmail> {
    const normalized = this.normalizeEmail(email);
    try {
      return await this.allowedRepository.save(
        this.allowedRepository.create({
          email: normalized,
          createdBy: opts.createdBy ?? null,
          note: opts.note ?? null,
        }),
      );
    } catch (err) {
      if (err?.code === '23505') {
        throw new ConflictException('Email is already on the allowlist');
      }
      throw err;
    }
  }

  async removeById(id: number): Promise<void> {
    const result = await this.allowedRepository.delete({ id });
    if (!result.affected) {
      throw new NotFoundException('Allowlist entry not found');
    }
  }

  private async seedBootstrapIfEmpty(): Promise<void> {
    const count = await this.allowedRepository.count();
    if (count > 0) return;

    const emails = this.authConfiguration.bootstrapAllowedEmails ?? [];
    if (emails.length === 0) {
      this.logger.warn(
        'auth_allowed_emails is empty and AUTH_BOOTSTRAP_ALLOWED_EMAILS is unset — all sign-up/sign-in will be rejected until an allowlist row is added',
      );
      return;
    }

    for (const email of emails) {
      await this.allowedRepository.save(
        this.allowedRepository.create({
          email: this.normalizeEmail(email),
          createdBy: null,
          note: 'bootstrap',
        }),
      );
    }
    this.logger.log(
      `Seeded ${emails.length} bootstrap allowlist email(s) from AUTH_BOOTSTRAP_ALLOWED_EMAILS`,
    );
  }
}
