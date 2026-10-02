import { appName, contactInbox } from '../email/branding';
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import type { ContactMessageOutput } from '@schovexa/validation';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { escapeHtml } from '../common/html.util';

const TOPIC_LABELS: Record<string, string> = {
  DEMO: 'Book a demo',
  PRICING: 'Pricing & plans',
  SUPPORT: 'Support',
  PARTNERSHIP: 'Partnership',
  OTHER: 'Something else',
};

// Where contact-form messages are delivered. Overridable per deployment
// with CONTACT_INBOX_EMAIL; the default is the founder's inbox.
const DEFAULT_INBOX = 'utkarshsingh737091@gmail.com';

// Subjects are single-line headers — collapse any CR/LF a visitor typed so
// nothing they write can add a header.
const oneLine = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async submit(input: ContactMessageOutput, meta: { ipAddress: string | null; userAgent: string | null }) {
    // Honeypot filled in → a bot. Look successful, store and send nothing.
    if (input.website) {
      this.logger.warn('Contact form honeypot triggered — message dropped');
      return { status: 'ok' as const };
    }

    const saved = await this.prisma.contactMessage.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone || null,
        organization: input.organization || null,
        topic: input.topic,
        message: input.message,
        ipHash: meta.ipAddress ? createHash('sha256').update(meta.ipAddress).digest('hex') : null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      },
    });

    const topic = TOPIC_LABELS[input.topic] ?? input.topic;
    const rows: [string, string][] = [
      ['Name', input.name],
      ['Email', input.email],
      ['Phone', input.phone || '—'],
      ['School / organisation', input.organization || '—'],
      ['Topic', topic],
    ];

    const text = [
      `New message from the ${appName()} contact form`,
      '',
      ...rows.map(([k, v]) => `${k}: ${v}`),
      '',
      input.message,
    ].join('\n');

    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0b1b3a">
        <h2 style="margin:0 0 4px">New contact message</h2>
        <p style="margin:0 0 16px;color:#64748b">Received through the ${escapeHtml(appName())} website</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          ${rows
            .map(
              ([k, v]) =>
                `<tr><td style="padding:6px 12px 6px 0;color:#64748b;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 0;font-weight:600">${escapeHtml(v)}</td></tr>`,
            )
            .join('')}
        </table>
        <div style="margin-top:16px;padding:16px;border-radius:12px;background:#f1f5f9;white-space:pre-wrap;line-height:1.6;font-size:14px">${escapeHtml(input.message)}</div>
        <p style="margin-top:16px;font-size:12px;color:#94a3b8">Hit “Reply” to answer ${escapeHtml(input.name)} directly.</p>
      </div>`;

    const sent = await this.email.send({
      to: contactInbox(DEFAULT_INBOX),
      subject: oneLine(`[${appName()}] ${topic} — ${input.name}`).slice(0, 150),
      text,
      html,
      replyTo: input.email,
    });

    if (sent) {
      await this.prisma.contactMessage.update({ where: { id: saved.id }, data: { emailedAt: new Date() } });
    } else {
      this.logger.warn(`Contact message ${saved.id} stored but not emailed (SMTP unconfigured or failed)`);
    }

    return { status: 'ok' as const };
  }
}
