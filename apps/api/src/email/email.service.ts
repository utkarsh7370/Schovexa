import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type SMTPPool from 'nodemailer/lib/smtp-pool';
import { describeEmailConfig, resolveEmailConfig, type EmailConfig } from './email.config';

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Where a plain "Reply" should go — e.g. the person who filled in a contact form. */
  replyTo?: string;
}

// One real delivery channel — SMTP, which every provider worth using
// (Gmail, Outlook, SES, Resend, Postmark, SendGrid, Mailgun, or a school's own
// mail server) exposes, so this never locks the deployer into a vendor SDK.
//
// Everything about it comes from environment variables (see email.config.ts
// and .env.example): who it sends as, where replies go, who gets a copy,
// which provider, whether it is on at all. Without SMTP settings it falls
// back to logging the email instead of sending it, so local development and
// the test suite never need real credentials — and nothing in the app depends
// on delivery succeeding (invite and reset links are also shown on screen).
@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private readonly config: EmailConfig;
  private readonly transporter: Transporter | null;

  constructor() {
    this.config = resolveEmailConfig();
    const smtp = this.config.smtp;
    this.transporter = this.config.enabled && smtp ? this.createTransport(smtp) : null;
  }

  private createTransport(smtp: NonNullable<EmailConfig['smtp']>): Transporter {
    const options: SMTPTransport.Options = {
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTLS: smtp.requireTls,
      connectionTimeout: smtp.connectionTimeoutMs,
      greetingTimeout: smtp.connectionTimeoutMs,
      tls: { rejectUnauthorized: smtp.rejectUnauthorized },
      auth: smtp.user ? { user: smtp.user, pass: smtp.password ?? '' } : undefined,
    };
    // SMTP_POOL=true keeps connections open for busy deployments sending many emails.
    return smtp.pool ? nodemailer.createTransport({ ...options, pool: true } as SMTPPool.Options) : nodemailer.createTransport(options);
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  /** What email is set to do right now (no secrets) — for the startup log and the test script. */
  get summary(): string {
    return describeEmailConfig(this.config);
  }

  get problems(): string[] {
    return this.config.problems;
  }

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.logger.log(this.summary);
    for (const problem of this.config.problems.slice(this.config.enabled ? 0 : 1)) this.logger.warn(problem);
    // Check the login actually works, in the background, so a wrong password
    // shows up at startup instead of when the first invite is sent.
    if (this.transporter && process.env.EMAIL_VERIFY_ON_START !== 'false') {
      void this.verify().then((result) => {
        if (result.ok) this.logger.log('Email connection verified — the mail server accepted our login.');
        else this.logger.error(`Email connection failed: ${result.error}. Check SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASSWORD.`);
      });
    }
  }

  /** Opens a connection and logs in, without sending anything. */
  async verify(): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!this.transporter) return { ok: false, error: this.config.problems[0] ?? 'Email is not configured' };
    try {
      await this.transporter.verify();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Resolves true only when the provider accepted the message; false when
  // SMTP is unconfigured or the send failed. Never throws.
  async send(input: SendEmailInput): Promise<boolean> {
    if (!this.transporter) {
      this.logger.log(`Email is off — not sending "${input.subject}" to ${input.to}`);
      return false;
    }

    const { redirectAllTo, bcc, replyTo } = this.config;
    // A newline in a subject would let it inject headers; strip it, then add the configured prefix.
    const subject = `${this.config.subjectPrefix ? `${this.config.subjectPrefix} ` : ''}${input.subject}`.replace(/[\r\n]+/g, ' ').trim();
    const to = redirectAllTo ?? input.to;

    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to,
        subject: redirectAllTo ? `${subject} [for ${input.to}]` : subject,
        text: input.text,
        html: input.html,
        ...(input.replyTo || replyTo ? { replyTo: input.replyTo ?? replyTo ?? undefined } : {}),
        // A staging redirect must not also copy the real BCC list.
        ...(bcc.length > 0 && !redirectAllTo ? { bcc } : {}),
      });
      return true;
    } catch (err) {
      // Never let a provider outage break an invite/reset flow — the
      // link is still available through the API response / on-screen
      // fallback either way, this is a best-effort delivery channel.
      this.logger.error(`Failed to send "${subject}" to ${to}`, err instanceof Error ? err.stack : err);
      return false;
    }
  }
}
