import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NoticeAudience, NotificationChannel } from '@prisma/client';
import type { Notice, Prisma } from '@prisma/client';
import type { CreateNoticeInput } from '@schovexa/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../authorization/authorization.service';
import type { AuthContext } from '../authorization/authorization.types';
import { NotificationsService } from '../notifications/notifications.service';
import { RecipientsService } from '../teaching/recipients.service';
import { TeachingScopeService } from '../teaching/teaching-scope.service';

// Notices are announcements with an audience: the whole school, a class, a section, or one person.
//
// Who can write what: an administrator (notice.create at school scope) can address anyone. A teacher holds
// the same permission at OWN_CLASS scope, which means they can announce to the classes and sections they
// teach — and nothing wider. Who SEES what: everyone sees school-wide notices and ones addressed to them;
// a class or section notice is seen by its teachers and by the parents of the children in it, not by
// the rest of the school. Drafts and scheduled notices are visible only to their author and administrators.
@Injectable()
export class NoticesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
    private readonly scopeService: TeachingScopeService,
    private readonly recipients: RecipientsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async canManageAll(roleId: string): Promise<boolean> {
    return (await this.authorizationService.getGrant(roleId, 'notice.create'))?.scope === 'ALL_SCHOOL';
  }

  /** The `where` clause for the notices this person is allowed to see. */
  private async visibleWhere(auth: AuthContext): Promise<Prisma.NoticeWhereInput> {
    const base = { schoolId: auth.schoolId, deletedAt: null };
    if (await this.canManageAll(auth.roleId)) return base;
    const { sectionIds, classIds } = await this.scopeService.audienceOf(auth);
    return {
      ...base,
      OR: [
        { publishedById: auth.userId },
        {
          publishedAt: { not: null },
          OR: [
            { audienceType: NoticeAudience.ALL_SCHOOL },
            { audienceType: NoticeAudience.INDIVIDUAL, audienceRefId: auth.userId },
            ...(sectionIds.length ? [{ audienceType: NoticeAudience.SECTION, audienceRefId: { in: sectionIds } }] : []),
            ...(classIds.length ? [{ audienceType: NoticeAudience.CLASS, audienceRefId: { in: classIds } }] : []),
          ],
        },
      ],
    };
  }

  async list(auth: AuthContext) {
    const notices = await this.prisma.notice.findMany({ where: await this.visibleWhere(auth), orderBy: { createdAt: 'desc' }, take: 300 });
    const noticeIds = notices.map((n) => n.id);

    const [reads, notifications, authors] = await Promise.all([
      this.prisma.noticeRead.findMany({ where: { noticeId: { in: noticeIds }, userId: auth.userId } }),
      this.prisma.notification.findMany({ where: { noticeId: { in: noticeIds }, userId: auth.userId } }),
      this.prisma.user.findMany({ where: { id: { in: [...new Set(notices.map((n) => n.publishedById))] } }, select: { id: true, firstName: true, lastName: true } }),
    ]);
    const readNoticeIds = new Set([...reads.map((r) => r.noticeId), ...notifications.filter((n) => n.readAt && n.noticeId).map((n) => n.noticeId as string)]);
    const authorName = new Map(authors.map((a) => [a.id, `${a.firstName} ${a.lastName}`.trim()]));
    return notices.map((notice) => ({ ...notice, isRead: readNoticeIds.has(notice.id), author: authorName.get(notice.publishedById) ?? null, mine: notice.publishedById === auth.userId }));
  }

  /** A teacher may address only the classes and sections they teach; an administrator, anyone. */
  private async assertMayAddress(auth: AuthContext, audienceType: NoticeAudience, refId: string | null): Promise<void> {
    if (auth.scope === 'ALL_SCHOOL') return;
    const denied = () => new ForbiddenException({ code: 'FORBIDDEN', message: 'You can send announcements to your own classes and sections. School-wide notices come from the school office.' });
    if (audienceType !== NoticeAudience.SECTION && audienceType !== NoticeAudience.CLASS) throw denied();
    const scope = await this.scopeService.resolve(auth);
    if (audienceType === NoticeAudience.SECTION) {
      if (!refId || !scope.canSeeSection(refId)) throw denied();
      return;
    }
    const sections = await this.prisma.section.findMany({ where: { classId: refId ?? '__none__', schoolId: auth.schoolId, deletedAt: null }, select: { id: true } });
    if (!sections.some((s) => scope.canSeeSection(s.id))) throw denied();
  }

  async create(auth: AuthContext, input: CreateNoticeInput) {
    let audienceRefId: string | null = null;
    if (input.audienceType !== NoticeAudience.ALL_SCHOOL) {
      audienceRefId = await this.resolveAudienceRef(auth.schoolId, input.audienceType, input.audienceRefId);
    }
    await this.assertMayAddress(auth, input.audienceType as NoticeAudience, audienceRefId);
    let scheduledFor: Date | null = null;
    if (input.scheduledFor) {
      scheduledFor = new Date(input.scheduledFor);
      if (scheduledFor.getTime() <= Date.now() + 30_000) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Choose a time in the future to schedule a notice.', details: [{ field: 'scheduledFor', message: 'Must be in the future.' }] });
      }
    }

    return this.prisma.notice.create({
      data: { schoolId: auth.schoolId, title: input.title, body: input.body, audienceType: input.audienceType, audienceRefId, publishedById: auth.userId, scheduledFor },
    });
  }

  private async resolveAudienceRef(schoolId: string, audienceType: CreateNoticeInput['audienceType'], refId: string | undefined): Promise<string> {
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
      const membership = await this.prisma.schoolMembership.findFirst({ where: { userId: refId, schoolId, status: 'ACTIVE', deletedAt: null } });
      if (!membership) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown recipient.' });
      }
    }
    return refId;
  }

  async publish(auth: AuthContext, noticeId: string) {
    const notice = await this.findOwn(auth.schoolId, noticeId);
    // A teacher publishes only their own notices; an administrator any.
    if (auth.scope !== 'ALL_SCHOOL' && notice.publishedById !== auth.userId) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    await this.assertMayAddress(auth, notice.audienceType, notice.audienceRefId);
    if (notice.publishedAt) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'This notice is already published.' });
    }
    const published = await this.releaseOne(notice);
    if (!published) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'This notice is already published.' });
    return published;
  }

  /**
   * Publishes the notice now — atomically, so two servers (or a click racing the schedule) can't both do it —
   * and tells the people it is addressed to. Returns null if someone else got there first.
   */
  async releaseOne(notice: Notice): Promise<Notice | null> {
    const claimed = await this.prisma.notice.updateMany({ where: { id: notice.id, publishedAt: null, deletedAt: null }, data: { publishedAt: new Date(), scheduledFor: null } });
    if (claimed.count === 0) return null;
    const schoolId = notice.schoolId;

    // INDIVIDUAL audience is naturally a single recipient — one Notification row here is the exact case
    // docs/database.md §8 and the F4 review finding say is safe to create synchronously.
    if (notice.audienceType === NoticeAudience.INDIVIDUAL && notice.audienceRefId) {
      await this.prisma.notification.create({
        data: { schoolId, userId: notice.audienceRefId, noticeId: notice.id, channel: NotificationChannel.IN_APP, title: notice.title, body: notice.body },
      });
    } else if ((notice.audienceType === NoticeAudience.SECTION || notice.audienceType === NoticeAudience.CLASS) && notice.audienceRefId) {
      // A class or section is a small audience (unlike the whole school, which stays lazy): tell its parents.
      const sections = notice.audienceType === NoticeAudience.SECTION ? [notice.audienceRefId] : (await this.prisma.section.findMany({ where: { classId: notice.audienceRefId, schoolId, deletedAt: null }, select: { id: true } })).map((s) => s.id);
      const userIds = (await Promise.all(sections.map((sectionId) => this.recipients.parentUserIds(schoolId, { sectionId })))).flat();
      await this.notifications.notify({ schoolId, userIds, title: notice.title, body: notice.body.slice(0, 200), link: '/dashboard/notices' });
    }
    return this.prisma.notice.findUniqueOrThrow({ where: { id: notice.id } });
  }

  /** Publishes every scheduled notice whose time has come. Called on a timer, and safe to call twice. */
  async publishDue(now = new Date()): Promise<number> {
    const due = await this.prisma.notice.findMany({ where: { publishedAt: null, deletedAt: null, scheduledFor: { lte: now } }, take: 100 });
    let published = 0;
    for (const notice of due) if (await this.releaseOne(notice)) published += 1;
    return published;
  }

  async markRead(auth: AuthContext, noticeId: string) {
    const visible = await this.prisma.notice.findFirst({ where: { id: noticeId, ...(await this.visibleWhere(auth)) } });
    if (!visible) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });

    // Everyone who opens a notice gets a NoticeRead row. That is what list() reads back as `isRead` —
    // including for an INDIVIDUAL notice addressed to someone else, which a manager can still open.
    await this.prisma.noticeRead.upsert({
      where: { noticeId_userId: { noticeId, userId: auth.userId } },
      create: { schoolId: auth.schoolId, noticeId, userId: auth.userId },
      update: {},
    });
    // The addressed recipient additionally has an in-app Notification (created at publish time) that tracks its own read state.
    if (visible.audienceType === NoticeAudience.INDIVIDUAL) {
      await this.prisma.notification.updateMany({ where: { schoolId: auth.schoolId, noticeId, userId: auth.userId, readAt: null }, data: { readAt: new Date() } });
    }
    return { id: noticeId };
  }

  private async findOwn(schoolId: string, noticeId: string) {
    const notice = await this.prisma.notice.findFirst({ where: { id: noticeId, schoolId, deletedAt: null } });
    if (!notice) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    return notice;
  }
}
