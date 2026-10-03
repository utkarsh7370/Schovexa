import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { MessageKind, Prisma } from '@prisma/client';
import type { ParentQueryInput, SendMessageInput } from '@schovexa/validation';
import type { AuthContext } from '../authorization/authorization.types';
import { escapeHtml } from '../common/html.util';
import { buildPaginationMeta } from '../common/pagination.util';
import { appName, appUrl } from '../email/branding';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecipientsService } from '../teaching/recipients.service';
import { TeachingScopeService } from '../teaching/teaching-scope.service';

const PAGE = '/dashboard/messages';

// Teacher ↔ parent messages, kept inside the product. A message goes to the parents of one student or of one
// class (never someone else's), shows up in their inbox and notifications — and by email where the school's
// mail is set up and they haven't opted out. Phone numbers are never shared. A parent can write to the
// teachers of their own child, and a reply goes only to the person who wrote, not to the whole class.
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: TeachingScopeService,
    private readonly recipients: RecipientsService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
  ) {}

  private async names(ids: string[]) {
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  }

  async list(auth: AuthContext, box: 'inbox' | 'sent', page: number, pageSize: number) {
    const where: Prisma.MessageWhereInput = box === 'sent' ? { schoolId: auth.schoolId, senderId: auth.userId } : { schoolId: auth.schoolId, recipients: { some: { userId: auth.userId } } };
    const [total, rows] = await Promise.all([
      this.prisma.message.count({ where }),
      this.prisma.message.findMany({ where, include: { recipients: { where: { userId: auth.userId }, select: { readAt: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    const [names, students] = await Promise.all([
      this.names(rows.map((r) => r.senderId)),
      this.prisma.student.findMany({ where: { id: { in: rows.map((r) => r.studentId).filter((s): s is string => !!s) } }, select: { id: true, firstName: true, lastName: true } }),
    ]);
    const studentName = new Map(students.map((s) => [s.id, `${s.firstName} ${s.lastName}`.trim()]));
    return {
      data: rows.map((m) => ({
        id: m.id,
        threadId: m.threadId ?? m.id,
        kind: m.kind,
        subject: m.subject,
        preview: m.body.slice(0, 140),
        sender: names.get(m.senderId) ?? null,
        mine: m.senderId === auth.userId,
        student: m.studentId ? (studentName.get(m.studentId) ?? null) : null,
        unread: box === 'inbox' && m.recipients[0]?.readAt === null,
        createdAt: m.createdAt,
      })),
      pagination: buildPaginationMeta(page, pageSize, total),
    };
  }

  async unreadCount(auth: AuthContext) {
    return { unread: await this.prisma.messageRecipient.count({ where: { userId: auth.userId, readAt: null, message: { schoolId: auth.schoolId } } }) };
  }

  /** A whole conversation, oldest first. Only people who sent or received a message in it can read it. */
  async thread(auth: AuthContext, id: string) {
    const message = await this.prisma.message.findFirst({ where: { id, schoolId: auth.schoolId } });
    if (!message) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    const rootId = message.threadId ?? message.id;
    const all = await this.prisma.message.findMany({
      where: { schoolId: auth.schoolId, OR: [{ id: rootId }, { threadId: rootId }], AND: [{ OR: [{ senderId: auth.userId }, { recipients: { some: { userId: auth.userId } } }] }] },
      include: { recipients: { where: { userId: auth.userId }, select: { readAt: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (!all.some((m) => m.id === id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    await this.prisma.messageRecipient.updateMany({ where: { userId: auth.userId, readAt: null, messageId: { in: all.map((m) => m.id) } }, data: { readAt: new Date() } });
    const names = await this.names(all.map((m) => m.senderId));
    return {
      threadId: rootId,
      subject: all[0]?.subject ?? message.subject,
      messages: all.map((m) => ({ id: m.id, kind: m.kind, sender: names.get(m.senderId) ?? null, mine: m.senderId === auth.userId, body: m.body, createdAt: m.createdAt })),
    };
  }

  /** Teacher → the parents of one student, or of a whole class. */
  async send(auth: AuthContext, input: SendMessageInput) {
    const scope = await this.scopeService.resolve(auth);
    // Writing to a class's parents is a staff action; a parent writes to teachers through query() instead.
    if (scope.kind === 'PARENT') throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Use “Ask a teacher” to write to your child’s teachers.' });
    let studentIds: string[] | undefined;
    let sectionId = input.sectionId;
    if (input.studentId) {
      const student = await this.prisma.student.findFirst({ where: { id: input.studentId, schoolId: auth.schoolId, deletedAt: null }, select: { id: true, sectionId: true } });
      if (!student || !scope.canSeeStudent(student)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
      studentIds = [student.id];
      sectionId = student.sectionId ?? undefined;
    } else if (sectionId) {
      scope.assertSection(sectionId);
    }
    if (input.subjectId && sectionId) scope.assertTeaches(sectionId, input.subjectId);
    if ((input.kind === 'HOMEWORK' || input.kind === 'ASSIGNMENT') && !input.subjectId) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Choose the subject this is about.' });

    const parentIds = await this.recipients.parentUserIds(auth.schoolId, { sectionId, studentIds });
    const message = await this.prisma.message.create({
      data: { schoolId: auth.schoolId, kind: input.kind as MessageKind, senderId: auth.userId, studentId: input.studentId ?? null, sectionId: sectionId ?? null, subjectId: input.subjectId ?? null, subject: input.subject, body: input.body, recipients: { create: parentIds.map((userId) => ({ userId })) } },
    });
    const sender = (await this.names([auth.userId])).get(auth.userId) ?? 'A teacher';
    await this.deliver(auth.schoolId, parentIds, `${input.subject}`, `${sender}: ${input.body}`);
    const reachable = parentIds.length;
    const total = await this.countParents(auth.schoolId, sectionId, studentIds);
    return { id: message.id, delivered: reachable, withoutPortalAccount: Math.max(total - reachable, 0) };
  }

  private async countParents(schoolId: string, sectionId: string | undefined, studentIds: string[] | undefined): Promise<number> {
    const links = await this.prisma.studentParent.findMany({ where: { schoolId, student: { deletedAt: null, ...(studentIds ? { id: { in: studentIds } } : { sectionId: sectionId ?? '__none__' }) } }, select: { parentId: true } });
    return new Set(links.map((l) => l.parentId)).size;
  }

  /** Parent → the teachers of their own child (a named teacher, or the class teacher and everyone who teaches the class). */
  async query(auth: AuthContext, input: ParentQueryInput) {
    const scope = await this.scopeService.resolve(auth);
    if (scope.kind !== 'PARENT') throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only a parent can ask a teacher this way.' });
    const student = await this.prisma.student.findFirst({ where: { id: input.studentId, schoolId: auth.schoolId, deletedAt: null }, select: { id: true, sectionId: true } });
    if (!student || !student.sectionId || !scope.canSeeStudent(student)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    const teachers = await this.recipients.teacherUserIds(auth.schoolId, student.sectionId);
    const chosen = input.teacherUserId ? teachers.filter((t) => t.userId === input.teacherUserId) : teachers;
    if (chosen.length === 0) throw new BadRequestException({ code: 'NO_TEACHER', message: input.teacherUserId ? 'That teacher doesn’t teach your child.' : 'No teacher is assigned to your child’s class yet.' });
    const message = await this.prisma.message.create({
      data: { schoolId: auth.schoolId, kind: 'QUERY', senderId: auth.userId, studentId: student.id, sectionId: student.sectionId, subject: input.subject, body: input.body, recipients: { create: chosen.map((t) => ({ userId: t.userId })) } },
    });
    const sender = (await this.names([auth.userId])).get(auth.userId) ?? 'A parent';
    await this.notifications.notify({ schoolId: auth.schoolId, userIds: chosen.map((t) => t.userId), title: `Message from ${sender}`, body: input.subject, link: PAGE });
    return { id: message.id, sentTo: chosen.length };
  }

  /** A reply goes to whoever the message came from — or, if you are replying to yourself, to the same people again. */
  async reply(auth: AuthContext, id: string, body: string) {
    const original = await this.prisma.message.findFirst({ where: { id, schoolId: auth.schoolId }, include: { recipients: { select: { userId: true } } } });
    const involved = original && (original.senderId === auth.userId || original.recipients.some((r) => r.userId === auth.userId));
    if (!original || !involved) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    const to = original.senderId === auth.userId ? original.recipients.map((r) => r.userId) : [original.senderId];
    const reply = await this.prisma.message.create({
      data: { schoolId: auth.schoolId, kind: 'REPLY', senderId: auth.userId, studentId: original.studentId, sectionId: original.sectionId, subject: original.subject.startsWith('Re: ') ? original.subject : `Re: ${original.subject}`, body, replyToId: original.id, threadId: original.threadId ?? original.id, recipients: { create: to.map((userId) => ({ userId })) } },
    });
    const sender = (await this.names([auth.userId])).get(auth.userId) ?? 'Someone';
    await this.deliver(auth.schoolId, to, reply.subject, `${sender}: ${body}`);
    return { id: reply.id };
  }

  /** In-app for everyone; email too where the school's mail is set up and the person hasn't opted out. Never fails the send. */
  private async deliver(schoolId: string, userIds: string[], title: string, body: string) {
    await this.notifications.notify({ schoolId, userIds, title, body: body.slice(0, 200), link: PAGE });
    if (!this.email.isConfigured || userIds.length === 0) return;
    const people = await this.prisma.user.findMany({ where: { id: { in: userIds }, notifyByEmail: true, status: 'ACTIVE' }, select: { email: true, firstName: true } });
    for (const p of people) {
      void this.email
        .send({ to: p.email, subject: title, text: `Dear ${p.firstName},\n\n${body}\n\n— ${appName()}\n${appUrl(PAGE)}`, html: `<p>Dear ${escapeHtml(p.firstName)},</p><p>${escapeHtml(body)}</p><p>— ${escapeHtml(appName())}</p><p><a href="${appUrl(PAGE)}">Open your messages</a></p>` })
        .catch(() => false);
    }
  }
}
