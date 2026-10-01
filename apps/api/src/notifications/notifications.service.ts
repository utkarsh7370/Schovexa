import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface NotifyInput {
  schoolId: string;
  userIds: string[];
  title: string;
  body: string;
  /** App path the notification opens, e.g. /dashboard/academic-years. */
  link?: string;
}

// In-app notifications for system events (a year awaiting approval, a
// student marked absent…) — separate from Notices, which are school
// announcements anyone with notice.view can read. A notification is
// addressed to specific users and only ever shown to them.
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(input: NotifyInput): Promise<void> {
    const userIds = [...new Set(input.userIds)];
    if (userIds.length === 0) return;
    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({
        schoolId: input.schoolId,
        userId,
        channel: NotificationChannel.IN_APP,
        title: input.title,
        body: input.body,
        link: input.link ?? null,
      })),
    });
  }

  /** Active members of the school whose role grants `permissionKey` (e.g. who may approve a year). */
  async usersWithPermission(schoolId: string, permissionKey: string): Promise<{ id: string; email: string; firstName: string }[]> {
    const memberships = await this.prisma.schoolMembership.findMany({
      where: {
        schoolId,
        status: 'ACTIVE',
        deletedAt: null,
        role: { deletedAt: null, permissions: { some: { permission: { key: permissionKey } } } },
      },
      include: { user: true },
    });
    return memberships.filter((m) => m.user.status === 'ACTIVE').map((m) => ({ id: m.user.id, email: m.user.email, firstName: m.user.firstName }));
  }

  async listMine(schoolId: string, userId: string, limit = 30) {
    return this.prisma.notification.findMany({
      where: { schoolId, userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async markRead(schoolId: string, userId: string, id: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, schoolId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      // Already read is fine; someone else's (or missing) is a 404.
      const exists = await this.prisma.notification.findFirst({ where: { id, schoolId, userId } });
      if (!exists) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    return { id };
  }

  async markAllRead(schoolId: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { schoolId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
