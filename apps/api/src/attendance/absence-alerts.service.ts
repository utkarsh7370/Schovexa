import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, Prisma } from '@prisma/client';
import type { AbsenceAlertKind, AbsenceAlertStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { escapeHtml } from '../common/html.util';
import { todayInTimezone } from '../common/dates.util';
import { SchoolSettingsService } from '../school-settings/school-settings.service';

const CHILDREN_PAGE = '/dashboard/my-children';

interface Message {
  title: string;
  body: string;
}

// Tells a student's parents when the student is marked absent today.
//
// Delivery today: an in-app notification for parents who have a portal
// account, and an email for parents with an address (when the school's SMTP
// is set up). Each attempt is written to AbsenceAlert — sent, failed or
// skipped, and why — so staff can see who was reached and who has no
// contact on file. SMS / WhatsApp slot in as further channels once a gateway
// is chosen; nothing else here needs to change for that.
@Injectable()
export class AbsenceAlertsService {
  private readonly logger = new Logger(AbsenceAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly settings: SchoolSettingsService,
  ) {}

  /** Students just marked absent on `dateIso` → message their parents (once each). */
  async notifyAbsent(schoolId: string, studentIds: string[], dateIso: string): Promise<void> {
    await this.run(schoolId, studentIds, dateIso, 'ABSENT');
  }

  /** Students whose absence was corrected to present/late/excused → tell the parents who were told they were absent. */
  async notifyCorrection(schoolId: string, studentIds: string[], dateIso: string): Promise<void> {
    if (studentIds.length === 0) return;
    const alerted = await this.prisma.absenceAlert.findMany({
      where: { schoolId, studentId: { in: studentIds }, date: new Date(dateIso), kind: 'ABSENT', status: 'SENT' },
      select: { studentId: true },
    });
    await this.run(schoolId, [...new Set(alerted.map((a) => a.studentId))], dateIso, 'CORRECTION');
  }

  private async run(schoolId: string, studentIds: string[], dateIso: string, kind: AbsenceAlertKind): Promise<void> {
    if (studentIds.length === 0) return;
    try {
      const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
      if (!school || !school.notifyParentsOnAbsence) return;
      const { notifyAbsenceEmail } = await this.settings.get(schoolId);
      const isToday = dateIso === todayInTimezone(school.timezone);

      const students = await this.prisma.student.findMany({
        where: { id: { in: studentIds }, schoolId, deletedAt: null },
        include: { section: { include: { class: true } }, parents: { include: { parent: true } } },
      });

      for (const student of students) {
        const message = this.buildMessage(kind, school.name, dateIso, student, isToday);
        const parents = student.parents.map((link) => link.parent).filter((p) => !p.deletedAt);

        if (kind === 'ABSENT') {
          // Marked absent again after a correction: forget the earlier round so this one goes out.
          const corrected = await this.prisma.absenceAlert.count({ where: { studentId: student.id, date: new Date(dateIso), kind: 'CORRECTION' } });
          if (corrected > 0) {
            await this.prisma.absenceAlert.deleteMany({ where: { studentId: student.id, date: new Date(dateIso) } });
          }
        }

        for (const parent of parents) {
          await this.deliver(schoolId, student.id, dateIso, kind, parent, message, school.name, notifyAbsenceEmail);
        }
      }
    } catch (err) {
      // Telling parents must never stop attendance from being saved.
      this.logger.error('Absence alerts failed', err instanceof Error ? err.stack : err);
    }
  }

  private buildMessage(kind: AbsenceAlertKind, schoolName: string, dateIso: string, student: { firstName: string; lastName: string; section: { name: string; class: { name: string } } | null }, isToday: boolean): Message {
    const dateLabel = new Date(`${dateIso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    const full = `${student.firstName} ${student.lastName}`;
    const where = student.section ? ` (${student.section.class.name} – ${student.section.name})` : '';
    // An absence corrected within the school's edit window can be for an earlier day.
    const when = isToday ? 'today' : `on ${dateLabel}`;
    if (kind === 'CORRECTION') {
      return {
        title: `Update: ${student.firstName} is not absent ${when}`,
        body: `We’re sorry for the confusion — ${full}${where} was marked absent on ${dateLabel} by mistake and is now recorded as present. — ${schoolName}`,
      };
    }
    return {
      title: `${student.firstName} was marked absent ${when}`,
      body: `${full}${where} was marked absent on ${dateLabel}. If you weren’t expecting this, please contact ${schoolName}.`,
    };
  }

  /** Claims the (student, day, parent, channel) slot first so a double save can't message anyone twice, then sends and records the result. */
  private async claim(schoolId: string, studentId: string, parentId: string, dateIso: string, kind: AbsenceAlertKind, channel: NotificationChannel) {
    try {
      return await this.prisma.absenceAlert.create({
        data: { schoolId, studentId, parentId, date: new Date(dateIso), kind, channel, status: 'FAILED', detail: 'Sending…' },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null; // already handled
      throw err;
    }
  }

  private async finish(id: string, status: AbsenceAlertStatus, detail: string | null) {
    await this.prisma.absenceAlert.update({ where: { id }, data: { status, detail } });
  }

  private async deliver(
    schoolId: string,
    studentId: string,
    dateIso: string,
    kind: AbsenceAlertKind,
    parent: { id: string; userId: string | null; email: string | null; firstName: string },
    message: Message,
    schoolName: string,
    emailEnabled: boolean,
  ) {
    // In-app
    const inApp = await this.claim(schoolId, studentId, parent.id, dateIso, kind, NotificationChannel.IN_APP);
    if (inApp) {
      if (parent.userId) {
        await this.notifications.notify({ schoolId, userIds: [parent.userId], title: message.title, body: message.body, link: CHILDREN_PAGE });
        await this.finish(inApp.id, 'SENT', null);
      } else {
        await this.finish(inApp.id, 'SKIPPED', 'No portal account yet');
      }
    }

    // Email
    const mail = await this.claim(schoolId, studentId, parent.id, dateIso, kind, NotificationChannel.EMAIL);
    if (mail) {
      if (!emailEnabled) {
        await this.finish(mail.id, 'SKIPPED', 'Email alerts are turned off in the school’s notification settings');
      } else if (!parent.email) {
        await this.finish(mail.id, 'SKIPPED', 'No email address on file');
      } else if (!this.email.isConfigured) {
        await this.finish(mail.id, 'SKIPPED', 'Email isn’t set up for this school yet');
      } else {
        const sent = await this.email.send({
          to: parent.email,
          subject: `[${schoolName}] ${message.title}`.replace(/[\r\n]+/g, ' ').slice(0, 150),
          text: `Dear ${parent.firstName},\n\n${message.body}\n\n— ${schoolName}`,
          html: `<p>Dear ${escapeHtml(parent.firstName)},</p><p>${escapeHtml(message.body)}</p><p>— ${escapeHtml(schoolName)}</p>`,
        });
        await this.finish(mail.id, sent ? 'SENT' : 'FAILED', sent ? null : 'The email provider rejected the message');
      }
    }
  }

  /** For the attendance screen: per student in a section on a day, who was told and who couldn't be reached. */
  async alertsForSection(schoolId: string, sectionId: string, dateIso: string) {
    const students = await this.prisma.student.findMany({
      where: { schoolId, sectionId, deletedAt: null },
      include: { parents: { include: { parent: true } } },
    });
    const alerts = await this.prisma.absenceAlert.findMany({
      where: { schoolId, studentId: { in: students.map((s) => s.id) }, date: new Date(dateIso), kind: 'ABSENT' },
    });
    return students.map((student) => {
      const parents = student.parents.map((l) => l.parent).filter((p) => !p.deletedAt);
      const mine = alerts.filter((a) => a.studentId === student.id);
      const reachedParentIds = new Set(mine.filter((a) => a.status === 'SENT').map((a) => a.parentId));
      return {
        studentId: student.id,
        date: dateIso,
        parentCount: parents.length,
        parentsReached: reachedParentIds.size,
        attempts: mine.map((a) => ({
          parent: parents.find((p) => p.id === a.parentId) ? `${parents.find((p) => p.id === a.parentId)!.firstName} ${parents.find((p) => p.id === a.parentId)!.lastName}` : 'Parent',
          channel: a.channel,
          status: a.status,
          detail: a.detail,
        })),
      };
    });
  }
}
