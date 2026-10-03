import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import type { AbsenceAlertStatus, FeeReminderKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SchoolSettingsService } from '../school-settings/school-settings.service';
import { appName, appUrl } from '../email/branding';
import { escapeHtml } from '../common/html.util';
import { dateOnlyToIso, todayInTimezone } from '../common/dates.util';
import { feeMoney } from './fee-math';
import { formatMoney } from './money';

const CHILDREN_PAGE = '/dashboard/my-children';
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface NotifyOutcome {
  /** Parents who got at least one message. */
  reached: number;
  /** Parents nobody could reach (no portal account and no email). */
  unreachable: number;
  /** The same reminder already went out in the last 24 hours. */
  alreadyReminded: boolean;
}

const FEE_FOR_NOTICE = {
  student: { include: { parents: { include: { parent: { include: { user: { select: { notifyByEmail: true } } } } } } } },
  feeStructure: { include: { feeCategory: true } },
  payments: { where: { deletedAt: null } },
  refunds: { where: { status: 'PROCESSED' as const } },
} as const;

// Tells families about their fees: a payment was recorded (with the receipt),
// the receipt again, and due / outstanding / overdue reminders.
//
// Channels today: in-app (parents with a portal account) and email (when the
// school's mail is set up). SMS and WhatsApp slot in as further channels once a
// gateway exists; nothing else here needs to change for that. Every attempt is
// written to FeeReminder — sent, failed or skipped, and why — so staff can see
// who was and wasn't reached, and so a reminder can't go out twice in a day.
@Injectable()
export class FeeNotifierService {
  private readonly logger = new Logger(FeeNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly settings: SchoolSettingsService,
  ) {}

  /** A payment was recorded (or its receipt is being sent again). Never throws. */
  async paymentNotice(paymentId: string, kind: 'PAYMENT_CONFIRMATION' | 'RECEIPT', sentById: string | null): Promise<NotifyOutcome | null> {
    try {
      const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { receipt: true } });
      if (kind === 'PAYMENT_CONFIRMATION' && !(await this.settings.get(payment.schoolId)).notifyPaymentReceipt) return null;
      const fee = await this.prisma.studentFee.findUniqueOrThrow({ where: { id: payment.studentFeeId }, include: FEE_FOR_NOTICE });
      const money = feeMoney(fee);
      const who = `${fee.student.firstName} ${fee.student.lastName}`;
      const title = kind === 'RECEIPT' ? `Receipt ${payment.receipt?.receiptNo ?? ''} for ${fee.student.firstName}`.trim() : `Payment received for ${fee.student.firstName}`;
      const body =
        `We received ${formatMoney(payment.amountMinor)} (${fee.feeStructure.feeCategory.name}) for ${who} on ${dateOnlyToIso(payment.paidAt)}.` +
        `${payment.receipt ? ` Receipt no. ${payment.receipt.receiptNo}.` : ''} ` +
        (money.balanceMinor > 0 ? `Balance remaining: ${formatMoney(money.balanceMinor)}.` : 'This fee is now fully paid. Thank you.');
      return await this.deliver(fee, kind, { title, body }, sentById, false);
    } catch (err) {
      this.logger.error('Payment notice failed', err instanceof Error ? err.stack : err);
      return null;
    }
  }

  /** Remind about one fee. Skips (and says so) if the same reminder went out in the last 24 hours. */
  async reminder(studentFeeId: string, kind: Extract<FeeReminderKind, 'DUE' | 'OUTSTANDING' | 'OVERDUE'>, sentById: string): Promise<NotifyOutcome> {
    const fee = await this.prisma.studentFee.findUniqueOrThrow({ where: { id: studentFeeId }, include: FEE_FOR_NOTICE });
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: fee.schoolId }, select: { timezone: true } });
    const money = feeMoney(fee);
    const today = todayInTimezone(school.timezone);
    const due = fee.dueDate ? dateOnlyToIso(fee.dueDate) : null;
    const who = `${fee.student.firstName} ${fee.student.lastName}`;
    const category = fee.feeStructure.feeCategory.name;
    const amount = formatMoney(money.balanceMinor);
    const message =
      kind === 'OVERDUE'
        ? { title: `Overdue fee for ${fee.student.firstName}`, body: `${category} fee for ${who} (${amount}) was due on ${due ?? 'an earlier date'} and is still unpaid. Please pay at the school office as soon as you can.` }
        : kind === 'DUE'
          ? { title: `Fee due soon for ${fee.student.firstName}`, body: `${category} fee for ${who} (${amount}) is due ${due ? (due === today ? 'today' : `on ${due}`) : 'soon'}. Please pay at the school office.` }
          : { title: `Outstanding fee for ${fee.student.firstName}`, body: `${category} fee for ${who} has ${amount} outstanding. Please pay at the school office.` };
    return this.deliver(fee, kind, message, sentById, true);
  }

  private async deliver(
    fee: Awaited<ReturnType<FeeNotifierService['loadFee']>>,
    kind: FeeReminderKind,
    message: { title: string; body: string },
    sentById: string | null,
    cooldown: boolean,
  ): Promise<NotifyOutcome> {
    const parents = fee.student.parents.map((l) => l.parent).filter((p) => !p.deletedAt);
    if (cooldown) {
      const recent = await this.prisma.feeReminder.findFirst({
        where: { studentFeeId: fee.id, kind, status: 'SENT', createdAt: { gt: new Date(Date.now() - COOLDOWN_MS) } },
      });
      if (recent) {
        for (const parent of parents) await this.log(fee, parent.id, kind, NotificationChannel.IN_APP, 'SKIPPED', 'Already reminded in the last 24 hours', sentById);
        return { reached: 0, unreachable: 0, alreadyReminded: true };
      }
    }

    let reached = 0;
    let unreachable = 0;
    for (const parent of parents) {
      let anySent = false;

      if (parent.userId) {
        await this.notifications.notify({ schoolId: fee.schoolId, userIds: [parent.userId], title: message.title, body: message.body, link: CHILDREN_PAGE });
        await this.log(fee, parent.id, kind, NotificationChannel.IN_APP, 'SENT', null, sentById);
        anySent = true;
      } else {
        await this.log(fee, parent.id, kind, NotificationChannel.IN_APP, 'SKIPPED', 'No portal account yet', sentById);
      }

      if (!parent.email) {
        await this.log(fee, parent.id, kind, NotificationChannel.EMAIL, 'SKIPPED', 'No email address on file', sentById);
      } else if (parent.user && !parent.user.notifyByEmail) {
        await this.log(fee, parent.id, kind, NotificationChannel.EMAIL, 'SKIPPED', 'Prefers not to receive email', sentById);
      } else if (!this.email.isConfigured) {
        await this.log(fee, parent.id, kind, NotificationChannel.EMAIL, 'SKIPPED', 'Email isn’t set up for this school yet', sentById);
      } else {
        const sent = await this.email.send({
          to: parent.email,
          subject: message.title,
          text: `Dear ${parent.firstName},\n\n${message.body}\n\n— ${appName()}\n${appUrl(CHILDREN_PAGE)}`,
          html: `<p>Dear ${escapeHtml(parent.firstName)},</p><p>${escapeHtml(message.body)}</p><p>— ${escapeHtml(appName())}</p><p><a href="${appUrl(CHILDREN_PAGE)}">Open the parent portal</a></p>`,
        });
        await this.log(fee, parent.id, kind, NotificationChannel.EMAIL, sent ? 'SENT' : 'FAILED', sent ? null : 'The email provider rejected the message', sentById);
        if (sent) anySent = true;
      }

      if (anySent) reached += 1;
      else unreachable += 1;
    }
    return { reached, unreachable, alreadyReminded: false };
  }

  private loadFee(id: string) {
    return this.prisma.studentFee.findUniqueOrThrow({ where: { id }, include: FEE_FOR_NOTICE });
  }

  private async log(
    fee: { id: string; schoolId: string },
    parentId: string,
    kind: FeeReminderKind,
    channel: NotificationChannel,
    status: AbsenceAlertStatus,
    detail: string | null,
    sentById: string | null,
  ) {
    await this.prisma.feeReminder.create({ data: { schoolId: fee.schoolId, studentFeeId: fee.id, parentId, kind, channel, status, detail, sentById } });
  }
}
