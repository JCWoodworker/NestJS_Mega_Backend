import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Resend } from 'resend';

import emailConfig from './email.config';

/**
 * Thin wrapper over Resend. Kept to one method per email so a template
 * change never risks touching unrelated call sites, and so callers never
 * import the Resend SDK directly — swapping providers later means editing
 * this file only.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly client: Resend | null;

  constructor(
    @Inject(emailConfig.KEY)
    private readonly config: ConfigType<typeof emailConfig>,
  ) {
    // Missing in local/dev by default — degrades to a logged no-op rather
    // than crashing boot, since email is not on the critical path for the
    // rest of the app to function.
    this.client = config.resendApiKey ? new Resend(config.resendApiKey) : null;
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const link = `${
      this.config.frontendUrl
    }/verify-email?token=${encodeURIComponent(token)}`;

    if (!this.client) {
      this.logger.warn(
        `RESEND_API_KEY not set — would have sent verification link to ${to}: ${link}`,
      );
      return;
    }

    const { error } = await this.client.emails.send({
      from: this.config.fromEmail,
      to,
      subject: 'Verify your email',
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="margin-bottom: 8px;">Verify your email</h2>
          <p style="color: #555; line-height: 1.5;">
            Click below to verify this address. This link expires in 24 hours.
          </p>
          <p>
            <a href="${link}" style="display: inline-block; background: #0284c7; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">
              Verify email
            </a>
          </p>
          <p style="color: #999; font-size: 12px; margin-top: 24px;">
            If you didn't create this account, you can ignore this email.
          </p>
        </div>
      `,
    });

    if (error) {
      // Signup itself must not fail because of a mail-provider outage — the
      // resend endpoint is the recovery path, so this is a warning, not a
      // thrown error.
      this.logger.warn(
        `Failed to send verification email to ${to}: ${error.message}`,
      );
    }
  }

  /**
   * Account data export for admin purge / export-on-request. Throws when
   * Resend is unset or the provider rejects the send — callers that email
   * before deleting must fail closed rather than wipe without delivery.
   */
  async sendAccountExportEmail(
    to: string,
    attachments: { filename: string; content: Buffer }[],
  ): Promise<void> {
    if (!this.client) {
      throw new Error(
        'RESEND_API_KEY not set — cannot email account export',
      );
    }

    const { error } = await this.client.emails.send({
      from: this.config.fromEmail,
      to,
      subject: 'Your Strikedesk account data export',
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="margin-bottom: 8px;">Your account data</h2>
          <p style="color: #555; line-height: 1.5;">
            Attached are CSV files with the Strikedesk data we hold for this
            account. You can open them in Excel or Numbers.
          </p>
          <p style="color: #999; font-size: 12px; margin-top: 24px;">
            If you did not request this, contact support.
          </p>
        </div>
      `,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });

    if (error) {
      throw new Error(`Failed to send account export email: ${error.message}`);
    }
  }

}
