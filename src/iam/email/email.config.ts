import { registerAs } from '@nestjs/config';

export default registerAs('email', () => ({
  resendApiKey: process.env.RESEND_API_KEY?.trim() || null,
  /**
   * No custom domain is verified with Resend yet, so this defaults to their
   * shared sending address, which works with zero DNS setup. Switch this
   * once a real domain is verified — sending stays a one-line env change.
   */
  fromEmail: process.env.RESEND_FROM_EMAIL?.trim() || 'onboarding@resend.dev',
  /** Where verification links point. No prior env var pointed the backend
   * at the frontend's origin at all. */
  frontendUrl:
    process.env.FRONTEND_URL?.trim() || 'https://strikedesk.netlify.app',
}));
