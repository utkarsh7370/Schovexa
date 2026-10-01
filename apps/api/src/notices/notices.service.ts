import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NoticeAudience, NotificationChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../authorization/authorization.service';
import type { CreateNoticeInput } from '@schovexa/validation';

@Injectable()
export class NoticesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  // MVP simplification (docs/modules.md Phase 10): audience targeting
  // (ALL_SCHOOL/CLASS/SECTION/INDIVIDUAL) is descriptive metadata, not an
  // access filter — anyone holding notice.view sees every published
  // notice in the school, the same way every other ALL_SCHOOL-scoped
  // list in this codebase works. A true per-recipient filtered inbox
  // (only show a CLASS notice to students actually in that class) is a
  // natural follow-up, not built here.
  async list(schoolId: string, userId: string, roleId: string) {
    const canManage = !!(await this.authorizationService.getGrant(roleId, 'notice.create'));

    const notices = await this.prisma.notice.findMany({
      where: { schoolId, deletedAt: null, ...(canManage ? {} : { publishedAt: { not: null } }) },
      orderBy: { createdAt: 'desc' },
    });
    const noticeIds = notices.map((n) => n.id);

    const [reads, notifications] = await Promise.all([
      this.prisma.noticeRead.findMany({ where: { noticeId: { in: noticeIds }, userId } }),
      this.prisma.notification.findMany({ where: { noticeId: { in: noticeIds }, userId } }),
    ]);
    const readNoticeIds = new Set([
      ...reads.map((r) => r.noticeId),
      ...notifications.filter((n) => n.readAt && n.noticeId).map((n) => n.noticeId as string),
    ]);

    return notices.map((notice) => ({ ...notice, isRead: readNoticeIds.has(notice.id) }));
  }

  async create(schoolId: string, publishedById: string, input: CreateNoticeInput) {
    let audienceRefId: string | null = null;
    if (input.audienceType !== NoticeAudience.ALL_SCHOOL) {
      audienceRefId = await this.resolveAudienceRef(schoolId, input.audienceType, input.audienceRefId);
    }

    return this.prisma.notice.create({
      data: {
        schoolId,
        title: input.title,
        body: input.body,
        audienceType: input.audienceType,
        audienceRefId,
        publishedById,
      },
    });
  }

  private async resolveAudienceRef(
    schoolId: string,
    audienceType: CreateNoticeInput['audienceType'],
    refId: string | undefined,
  ): Promise<string> {
    if (!refId) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'A target is required for this audience.' });
    }
    if (audienceType === NoticeAudience.CLASS) {
      const klass = await this.prisma.class.findFirst({ where: { id: refId, schoolId, deletedAt: null } });
      if (!klass) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown class.' });
    } else if (audienceType === NoticeAudience.SECTION) {
      const section = await this.prisma.section.findFirst({ where: { id: refId, schoolId, deletedAt: null } });
      if (!section) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown section.' });
    } else if (audienceType === NoticeAudience.INDIVIDUAL) {
      const membership = await this.prisma.schoolMembership.findFirst({
        where: { userId: refId, schoolId, status: 'ACTIVE', deletedAt: null },
      });
      if (!membership) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown recipient.' });
      }
    }
    return refId;
  }

  async publish(schoolId: string, noticeId: string) {
    const notice = await this.findOwn(schoolId, noticeId);
    if (notice.publishedAt) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'This notice is already published.' });
    }

    const published = await this.prisma.notice.update({
      where: { id: noticeId },
      data: { publishedAt: new Date() },
    });

    // INDIVIDUAL audience is naturally a single recipient — one
    // Notification row here is the exact case docs/database.md §8 and
    // the F4 review finding say is safe to create synchronously (unlike
    // a broad-audience fan-out, which this design avoids entirely by
    // using lazy NoticeRead instead — see list()/markRead()).
    if (notice.audienceType === NoticeAudience.INDIVIDUAL && notice.audienceRefId) {
      await this.prisma.notification.create({
        data: {
          schoolId,
          userId: notice.audienceRefId,
          noticeId,
          channel: NotificationChannel.IN_APP,
          title: notice.title,
          body: notice.body,
        },
      });
    }

    return published;
  }

  async markRead(schoolId: string, userId: string, noticeId: string) {
    const notice = await this.findOwn(schoolId, noticeId);

    // Everyone who opens a notice gets a NoticeRead row. That is what
    // list() reads back as `isRead` — including for an INDIVIDUAL notice
    // addressed to someone else, which a manager (anyone with
    // notice.create) can still see and open. Marking only the recipient's
    // Notification row, as this used to, matched zero rows for that
    // viewer and left the notice "unread" — and blinking — forever.
    await this.prisma.noticeRead.upsert({
      where: { noticeId_userId: { noticeId, userId } },
      create: { schoolId, noticeId, userId },
      update: {},
    });

    // The addressed recipient additionally has an in-app Notification
    // (created at publish time) that tracks its own read state.
    if (notice.audienceType === NoticeAudience.INDIVIDUAL) {
      await this.prisma.notification.updateMany({
        where: { schoolId, noticeId, userId, readAt: null },
        data: { readAt: new Date() },
      });
    }
    return { id: noticeId };
  }

  async myNotifications(schoolId: string, userId: string) {
    return this.prisma.notification.findMany({
      where: { schoolId, userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findOwn(schoolId: string, noticeId: string) {
    const notice = await this.prisma.notice.findFirst({ where: { id: noticeId, schoolId, deletedAt: null } });
    if (!notice) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    return notice;
  }
}
