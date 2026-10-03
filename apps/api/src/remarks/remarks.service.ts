import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CreateRemarkInput, UpdateRemarkInput } from '@schovexa/validation';
import type { AuthContext } from '../authorization/authorization.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolSettingsService } from '../school-settings/school-settings.service';
import { RecipientsService } from '../teaching/recipients.service';
import { TeachingScopeService } from '../teaching/teaching-scope.service';

// What teachers notice about a student — academic progress, behaviour, strengths and weak spots,
// recommendations. Visible to the student's teachers; whether the family sees a remark is the school's
// policy (a default in settings) with the author able to decide per remark.
@Injectable()
export class RemarksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: TeachingScopeService,
    private readonly settings: SchoolSettingsService,
    private readonly recipients: RecipientsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async student(auth: AuthContext, studentId: string) {
    const scope = await this.scopeService.resolve(auth);
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId: auth.schoolId, deletedAt: null }, select: { id: true, firstName: true, sectionId: true } });
    if (!student || !scope.canSeeStudent(student)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    return { student, scope };
  }

  private async authors(ids: string[]) {
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  }

  async list(auth: AuthContext, studentId: string) {
    const { scope } = await this.student(auth, studentId);
    const rows = await this.prisma.studentRemark.findMany({
      where: { schoolId: auth.schoolId, studentId, deletedAt: null, ...(scope.kind === 'PARENT' ? { visibleToParents: true } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const [authors, subjects] = await Promise.all([
      this.authors(rows.map((r) => r.createdById)),
      this.prisma.subject.findMany({ where: { id: { in: rows.map((r) => r.subjectId).filter((s): s is string => !!s) } }, select: { id: true, name: true } }),
    ]);
    const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      body: r.body,
      subject: r.subjectId ? (subjectName.get(r.subjectId) ?? null) : null,
      visibleToParents: r.visibleToParents,
      author: authors.get(r.createdById) ?? null,
      mine: r.createdById === auth.userId,
      createdAt: r.createdAt,
    }));
  }

  async create(auth: AuthContext, input: CreateRemarkInput) {
    const { student } = await this.student(auth, input.studentId);
    const settings = await this.settings.get(auth.schoolId);
    if (input.subjectId) {
      const subject = await this.prisma.subject.findFirst({ where: { id: input.subjectId, schoolId: auth.schoolId, deletedAt: null }, select: { id: true } });
      if (!subject) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    const visible = input.visibleToParents ?? settings.shareRemarksWithParents;
    const row = await this.prisma.studentRemark.create({
      data: { schoolId: auth.schoolId, studentId: student.id, subjectId: input.subjectId || null, kind: input.kind ?? 'OBSERVATION', body: input.body, visibleToParents: visible, createdById: auth.userId },
    });
    if (visible) {
      const parents = await this.recipients.parentUserIds(auth.schoolId, { studentIds: [student.id] });
      await this.notifications.notify({ schoolId: auth.schoolId, userIds: parents, title: `A note about ${student.firstName}`, body: input.body.slice(0, 160), link: '/dashboard/my-children' });
    }
    return { id: row.id };
  }

  private async own(auth: AuthContext, id: string) {
    const scope = await this.scopeService.resolve(auth);
    const row = await this.prisma.studentRemark.findFirst({ where: { id, schoolId: auth.schoolId, deletedAt: null } });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    await this.student(auth, row.studentId);
    if (row.createdById !== auth.userId && !scope.all) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the person who wrote a remark can change it.' });
    return row;
  }

  async update(auth: AuthContext, id: string, input: UpdateRemarkInput) {
    await this.own(auth, id);
    const data: Prisma.StudentRemarkUpdateInput = { ...(input.kind ? { kind: input.kind } : {}), ...(input.body ? { body: input.body } : {}), ...(input.visibleToParents !== undefined ? { visibleToParents: input.visibleToParents } : {}) };
    await this.prisma.studentRemark.update({ where: { id }, data });
    return { id };
  }

  async remove(auth: AuthContext, id: string) {
    await this.own(auth, id);
    await this.prisma.studentRemark.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id };
  }
}
