import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';

import { Users } from '@users/entities/users.entity';
import { Role } from '@users/enums/role.enum';

import authConfig from '@config/auth.config';

/**
 * Promotes the one configured account to `admin` at boot.
 *
 * Sign-up cannot set a role (the DTO has no such field and the global
 * ValidationPipe rejects unknown properties), and no endpoint mutates
 * `users.role`, so without this the only way to create an admin is
 * hand-written SQL — which does not survive a database restore. Running it
 * on every boot makes the grant declarative and self-healing.
 *
 * Idempotent, and a no-op when `ADMIN_BOOTSTRAP_EMAIL` is unset or names an
 * account that has not signed up yet.
 */
@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
    @Inject(authConfig.KEY)
    private readonly authConfiguration: ConfigType<typeof authConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.promoteConfiguredAdmin();
  }

  private async promoteConfiguredAdmin(): Promise<void> {
    const email = this.authConfiguration.adminBootstrapEmail;
    if (!email) {
      return;
    }

    const user = await this.usersRepository.findOneBy({ email });
    if (!user) {
      this.logger.warn(
        `ADMIN_BOOTSTRAP_EMAIL is set to an account that does not exist yet — sign up as ${email}, then restart to promote it`,
      );
      return;
    }

    // Demote any other admin first. The `one_admin_only` partial unique
    // index would otherwise reject the promotion outright, and failing the
    // boot over a stale admin row is worse than reconciling to the
    // configured intent.
    const demoted = await this.usersRepository.update(
      { role: Role.Admin, id: Not(user.id) },
      { role: Role.Basic },
    );
    if (demoted.affected) {
      this.logger.warn(
        `Demoted ${demoted.affected} other admin account(s) to match ADMIN_BOOTSTRAP_EMAIL`,
      );
    }

    if (user.role === Role.Admin) {
      return;
    }

    await this.usersRepository.update({ id: user.id }, { role: Role.Admin });
    this.logger.log(`Promoted ${email} to admin`);
  }
}
