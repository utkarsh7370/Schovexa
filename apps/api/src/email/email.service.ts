import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Where a plain "Reply" should go — e.g. the person who filled in a contact form. */
  replyTo?: string;
}

// One real delivery channel — SMTP, which every provider worth using
// (SES, Resend, Postmark, SendGrid, Mailgun, or a school's own Google
// Workspace account) exposes, so this never locks the deployer into a
// specific vendor SDK. Chosen only when SMTP_HOST is set; otherwise
// falls back to logging the email instead of sending it, so local dev
// and this session's own test/demo tooling never need real credentials
// — the invite/reset link is still returned in the API response either
// way (see AuthService), so nothing regresses when this is unconfigured.
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter | null;
  private readonly from = process.env.SMTP_FROM || 'Schovexa <no-reply@schovexa.app>';

  constructor() {
    this.transporter = process.env.SMTP_HOST
      ? nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: process.env.SMTP_SECURE === 'true',
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
            : undefined,
        })
      : null;
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  // Resolves true only when the provider accepted the message; false when
  // SMTP is unconfigured or the send failed. Never throws.
  async send(input: SendEmailInput): Promise<boolean> {
    if (!this.transporter) {
      this.logger.log(`SMTP not configured — not sending "${input.subject}" to ${input.to}`);
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      });
      return true;
    } catch (err) {
      // Never let a provider outage break an invite/reset flow — the
      // link is still available through the API response / on-screen
      // fallback either way, this is a best-effort delivery channel.
      this.logger.error(`Failed to send "${input.subject}" to ${input.to}`, err instanceof Error ? err.stack : err);
      return false;
    }
  }
}
