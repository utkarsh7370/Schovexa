import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CourseworkKind, CourseworkStatus, Prisma, SubmissionStatus } from '@prisma/client';
import type { CreateCourseworkInput, SaveSubmissionsInput, UpdateCourseworkInput } from '@schovexa/validation';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../authorization/authorization.types';
import { buildPaginationMeta } from '../common/pagination.util';
import { dateOnlyToIso } from '../common/dates.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentsService } from '../teaching/attachments.service';
import { RecipientsService } from '../teaching/recipients.service';
import { SchoolClockService } from '../teaching/school-clock.service';
import { TeachingScopeService } from '../teaching/teaching-scope.service';

const INCLUDE = {
  section: { select: { id: true, name: true, class: { select: { name: true } } } },
  subject: { select: { id: true, name: true } },
} satisfies Prisma.CourseworkInclude;
type Row = Prisma.CourseworkGetPayload<{ include: typeof INCLUDE }>;

const LABEL: Record<CourseworkKind, { one: string; path: string }> = {
  HOMEWORK: { one: 'Homework', path: '/dashboard/homework' },
  ASSIGNMENT: { one: 'Assignment', path: '/dashboard/assignments' },
};
export const COURSEWORK_FILES = 'Coursework';
export const SUBMISSION_FILES = 'CourseworkSubmission';

export interface CourseworkFilters {
  sectionId?: string;
  subjectId?: string;
  status?: string;
  /** upcoming = due today or later and still active; overdue = past due and still has work to review */
  when?: string;
  search?: string;
}

// Homework and assignments: work set for a section in a subject, handed in by students, reviewed by the
// teacher. One service for both — a teacher's rights follow their (section, subject) assignment, a
// parent only ever sees their own children's class.
@Injectable()
export class CourseworkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: TeachingScopeService,
    private readonly clock: SchoolClockService,
    private readonly recipients: RecipientsService,
    private readonly notifications: NotificationsService,
    private readonly attachments: AttachmentsService,
    private readonly audit: AuditService,
  ) {}

  private toDto(c: Row, extra: Record<string, unknown> = {}) {
    return {
      id: c.id,
      kind: c.kind,
      title: c.title,
      description: c.description,
      dueDate: dateOnlyToIso(c.dueDate),
      priority: c.priority,
      maxMarks: c.maxMarks,
      status: c.status,
      wholeSection: c.studentIds.length === 0,
      studentCount: c.studentIds.length,
      section: { id: c.section.id, name: `${c.section.class.name} – ${c.section.name}` },
      subject: c.subject,
      createdAt: c.createdAt,
      ...extra,
    };
  }

  /** The row, only if this person may see it — otherwise a 404, exactly as if it didn't exist. */
  private async load(auth: AuthContext, kind: CourseworkKind, id: string): Promise<Row> {
    const scope = await this.scopeService.resolve(auth);
    const row = await this.prisma.coursework.findFirst({ where: { id, schoolId: auth.schoolId, kind }, include: INCLUDE });
    if (!row || !(scope.kind === 'PARENT' ? scope.canSeeSection(row.sectionId) : scope.canTeach(row.sectionId, row.subjectId))) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    return row;
  }

  /** Students this coursework is set for. */
  private rosterWhere(c: { sectionId: string; studentIds: string[]; schoolId?: string }): Prisma.StudentWhereInput {
    return { sectionId: c.sectionId, deletedAt: null, ...(c.studentIds.length ? { id: { in: c.studentIds } } : {}) };
  }

  async list(auth: AuthContext, kind: CourseworkKind, f: CourseworkFilters, page: number, pageSize: number) {
    const scope = await this.scopeService.resolve(auth);
    if (f.sectionId) scope.assertSection(f.sectionId);
    const today = await this.clock.today(auth.schoolId);
    const words = (f.search ?? '').trim().split(/\s+/).filter(Boolean);
    const parent = scope.kind === 'PARENT';
    const where: Prisma.CourseworkWhereInput = {
      schoolId: auth.schoolId,
      kind,
      ...scope.pairWhere(),
      ...(f.sectionId ? { sectionId: f.sectionId } : {}),
      ...(f.subjectId ? { subjectId: f.subjectId } : {}),
      ...(parent ? { status: 'ACTIVE' } : f.status && ['ACTIVE', 'CANCELLED', 'ARCHIVED'].includes(f.status) ? { status: f.status as CourseworkStatus } : {}),
      ...(f.when === 'upcoming' ? { status: 'ACTIVE', dueDate: { gte: new Date(today) } } : {}),
      ...(f.when === 'overdue' ? { status: 'ACTIVE', dueDate: { lt: new Date(today) } } : {}),
      ...(words.length ? { AND: words.map((w) => ({ title: { contains: w, mode: 'insensitive' as const } })) } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.coursework.count({ where }),
      this.prisma.coursework.findMany({ where, include: INCLUDE, orderBy: [{ dueDate: f.when === 'overdue' ? 'desc' : 'asc' }, { createdAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    const ids = rows.map((r) => r.id);
    const [byStatus, files, sizes] = await Promise.all([
      this.prisma.courseworkSubmission.groupBy({ by: ['courseworkId', 'status'], where: { courseworkId: { in: ids } }, _count: { _all: true } }),
      this.attachments.counts(auth.schoolId, COURSEWORK_FILES, ids),
      this.sectionSizes(auth.schoolId, rows),
    ]);
    const counts = new Map<string, Record<string, number>>();
    for (const g of byStatus) counts.set(g.courseworkId, { ...(counts.get(g.courseworkId) ?? {}), [g.status]: g._count._all });
    const mine = parent ? await this.childStatuses(auth, scope.childIds, ids) : null;
    return {
      data: rows.map((r) => {
        const c = counts.get(r.id) ?? {};
        const students = r.studentIds.length || sizes.get(r.sectionId) || 0;
        const done = (c.SUBMITTED ?? 0) + (c.REVIEWED ?? 0);
        return this.toDto(r, {
          overdue: r.status === 'ACTIVE' && dateOnlyToIso(r.dueDate) < today,
          files: files.get(r.id) ?? 0,
          progress: { students, submitted: done, toReview: c.SUBMITTED ?? 0, reviewed: c.REVIEWED ?? 0, resubmit: c.RESUBMIT ?? 0 },
          ...(mine ? { children: mine.get(r.id) ?? [] } : {}),
        });
      }),
      pagination: buildPaginationMeta(page, pageSize, total),
    };
  }

  private async sectionSizes(schoolId: string, rows: Row[]): Promise<Map<string, number>> {
    const sectionIds = [...new Set(rows.map((r) => r.sectionId))];
    if (sectionIds.length === 0) return new Map();
    const g = await this.prisma.student.groupBy({ by: ['sectionId'], where: { schoolId, sectionId: { in: sectionIds }, deletedAt: null }, _count: { _all: true } });
    return new Map(g.filter((x) => x.sectionId).map((x) => [x.sectionId as string, x._count._all]));
  }

  private async childStatuses(auth: AuthContext, childIds: ReadonlySet<string>, courseworkIds: string[]) {
    const [subs, kids] = await Promise.all([
      this.prisma.courseworkSubmission.findMany({ where: { courseworkId: { in: courseworkIds }, studentId: { in: [...childIds] } }, select: { courseworkId: true, studentId: true, status: true, marks: true, feedback: true } }),
      this.prisma.student.findMany({ where: { schoolId: auth.schoolId, id: { in: [...childIds] } }, select: { id: true, firstName: true } }),
    ]);
    const name = new Map(kids.map((k) => [k.id, k.firstName]));
    const out = new Map<string, { studentId: string; name: string; status: SubmissionStatus; marks: number | null; feedback: string | null }[]>();
    for (const s of subs) out.set(s.courseworkId, [...(out.get(s.courseworkId) ?? []), { studentId: s.studentId, name: name.get(s.studentId) ?? '', status: s.status, marks: s.marks, feedback: s.feedback }]);
    return out;
  }

  async detail(auth: AuthContext, kind: CourseworkKind, id: string) {
    const c = await this.load(auth, kind, id);
    const scope = await this.scopeService.resolve(auth);
    // A parent sees the class's work, but the roster is only their own children — never classmates.
    const roster: Prisma.StudentWhereInput = scope.kind === 'PARENT' ? { AND: [this.rosterWhere(c), { id: { in: [...scope.childIds] } }] } : this.rosterWhere(c);
    const [students, submissions, files] = await Promise.all([
      this.prisma.student.findMany({ where: { schoolId: auth.schoolId, ...roster }, select: { id: true, firstName: true, lastName: true, admissionNo: true, rollNo: true }, orderBy: { admissionNo: 'asc' } }),
      this.prisma.courseworkSubmission.findMany({ where: { courseworkId: id, ...(scope.kind === 'PARENT' ? { studentId: { in: [...scope.childIds] } } : {}) } }),
      this.attachments.list(auth.schoolId, COURSEWORK_FILES, id),
    ]);
    const subFiles = await this.attachments.counts(auth.schoolId, SUBMISSION_FILES, submissions.map((s) => s.id));
    const byStudent = new Map(submissions.map((s) => [s.studentId, s]));
    return {
      ...this.toDto(c, { overdue: c.status === 'ACTIVE' && dateOnlyToIso(c.dueDate) < (await this.clock.today(auth.schoolId)) }),
      files,
      roster: students.map((s) => {
        const sub = byStudent.get(s.id);
        return {
          studentId: s.id,
          name: `${s.firstName} ${s.lastName}`.trim(),
          admissionNo: s.admissionNo,
          rollNo: s.rollNo,
          submissionId: sub?.id ?? null,
          status: sub?.status ?? 'PENDING',
          submittedAt: sub?.submittedAt ?? null,
          marks: sub?.marks ?? null,
          feedback: sub?.feedback ?? null,
          reviewedAt: sub?.reviewedAt ?? null,
          files: sub ? (subFiles.get(sub.id) ?? 0) : 0,
        };
      }),
    };
  }

  async create(auth: AuthContext, kind: CourseworkKind, input: CreateCourseworkInput) {
    if (input.kind !== kind) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: `This is the ${LABEL[kind].one.toLowerCase()} screen.` });
    const scope = await this.scopeService.resolve(auth);
    const sectionIds = [...new Set(input.sectionIds)];
    for (const sectionId of sectionIds) scope.assertTeaches(sectionId, input.subjectId);
    const studentIds = [...new Set(input.studentIds ?? [])];
    if (studentIds.length > 0) {
      if (sectionIds.length > 1) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Choose one section to set work for particular students.' });
      const valid = await this.prisma.student.count({ where: { id: { in: studentIds }, schoolId: auth.schoolId, sectionId: sectionIds[0], deletedAt: null } });
      if (valid !== studentIds.length) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Some of those students aren’t in this section.' });
    }
    if (kind === 'HOMEWORK' && input.maxMarks) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Homework isn’t marked — use an assignment for that.' });
    const subject = await this.prisma.subject.findFirst({ where: { id: input.subjectId, schoolId: auth.schoolId, deletedAt: null }, select: { name: true } });
    if (!subject) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown subject.' });

    const created = await this.prisma.$transaction(
      sectionIds.map((sectionId) =>
        this.prisma.coursework.create({
          data: { schoolId: auth.schoolId, kind, sectionId, subjectId: input.subjectId, title: input.title, description: input.description || null, dueDate: new Date(input.dueDate), priority: input.priority ?? 'NORMAL', maxMarks: input.maxMarks ?? null, studentIds, createdById: auth.userId },
          include: INCLUDE,
        }),
      ),
    );
    for (const row of created) {
      await this.audit.record({ schoolId: auth.schoolId, userId: auth.userId, action: `${kind.toLowerCase()}.created`, module: kind.toLowerCase(), resourceType: 'Coursework', resourceId: row.id, metadata: { title: row.title, section: row.sectionId, due: input.dueDate } });
      // Tell the families: in their notifications, at once.
      const parentIds = await this.recipients.parentUserIds(auth.schoolId, { sectionId: row.sectionId, studentIds });
      await this.notifications.notify({
        schoolId: auth.schoolId,
        userIds: parentIds,
        title: `${LABEL[kind].one}: ${row.title}`,
        body: `${subject.name} · due ${input.dueDate}${input.description ? `. ${input.description.slice(0, 140)}` : ''}`,
        link: '/dashboard/my-children',
      });
    }
    return created.map((r) => this.toDto(r));
  }

  async update(auth: AuthContext, kind: CourseworkKind, id: string, input: UpdateCourseworkInput) {
    const c = await this.load(auth, kind, id);
    if (c.status !== 'ACTIVE' && input.status === undefined) throw new ConflictException({ code: 'NOT_ACTIVE', message: `This ${LABEL[kind].one.toLowerCase()} is ${c.status.toLowerCase()}. Re-activate it to change it.` });
    if (kind === 'HOMEWORK' && input.maxMarks) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Homework isn’t marked.' });
    const updated = await this.prisma.coursework.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.dueDate !== undefined ? { dueDate: new Date(input.dueDate) } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.maxMarks !== undefined ? { maxMarks: input.maxMarks } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      include: INCLUDE,
    });
    if (input.status === 'CANCELLED' || (input.dueDate && input.dueDate !== dateOnlyToIso(c.dueDate))) {
      const parentIds = await this.recipients.parentUserIds(auth.schoolId, { sectionId: c.sectionId, studentIds: c.studentIds });
      await this.notifications.notify({
        schoolId: auth.schoolId,
        userIds: parentIds,
        title: input.status === 'CANCELLED' ? `${LABEL[kind].one} cancelled: ${c.title}` : `${LABEL[kind].one} date changed: ${c.title}`,
        body: input.status === 'CANCELLED' ? `${c.subject.name} — no need to do this one.` : `${c.subject.name} — now due ${input.dueDate}.`,
        link: '/dashboard/my-children',
      });
    }
    await this.audit.record({ schoolId: auth.schoolId, userId: auth.userId, action: `${kind.toLowerCase()}.updated`, module: kind.toLowerCase(), resourceType: 'Coursework', resourceId: id, metadata: JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue });
    return this.toDto(updated);
  }

  /** Record who handed in, review it, and (for assignments) mark it. One call saves a whole class. */
  async saveSubmissions(auth: AuthContext, kind: CourseworkKind, id: string, input: SaveSubmissionsInput) {
    const c = await this.load(auth, kind, id);
    if (c.status === 'CANCELLED') throw new ConflictException({ code: 'NOT_ACTIVE', message: `This ${LABEL[kind].one.toLowerCase()} was cancelled.` });
    const studentIds = input.records.map((r) => r.studentId);
    const valid = await this.prisma.student.findMany({ where: { id: { in: studentIds }, schoolId: auth.schoolId, ...this.rosterWhere(c) }, select: { id: true } });
    if (valid.length !== new Set(studentIds).size) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Some of those students aren’t set this work.' });

    const existing = await this.prisma.courseworkSubmission.findMany({ where: { courseworkId: id, studentId: { in: studentIds } } });
    const before = new Map(existing.map((e) => [e.studentId, e]));
    const now = new Date();
    for (const r of input.records) {
      if (r.marks !== undefined && r.marks !== null) {
        if (kind !== 'ASSIGNMENT') throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Homework isn’t marked.' });
        if (c.maxMarks !== null && r.marks > c.maxMarks) throw new BadRequestException({ code: 'MARKS_ABOVE_MAXIMUM', message: `Marks can’t be more than ${c.maxMarks}.`, details: [{ field: r.studentId, message: `Out of ${c.maxMarks}` }] });
      }
    }
    await this.prisma.$transaction(
      input.records.map((r) => {
        const prev = before.get(r.studentId);
        const reviewing = r.status === 'REVIEWED' || r.status === 'RESUBMIT';
        const data = {
          status: r.status,
          submittedAt: r.status === 'PENDING' ? null : (prev?.submittedAt ?? now),
          marks: r.marks === undefined ? (prev?.marks ?? null) : r.marks,
          feedback: r.feedback === undefined ? (prev?.feedback ?? null) : r.feedback || null,
          reviewedAt: reviewing ? now : null,
          reviewedById: reviewing ? auth.userId : null,
        };
        return this.prisma.courseworkSubmission.upsert({
          where: { courseworkId_studentId: { courseworkId: id, studentId: r.studentId } },
          create: { schoolId: auth.schoolId, courseworkId: id, studentId: r.studentId, ...data },
          update: data,
        });
      }),
    );

    // A request to redo it, or fresh marks / feedback, is news for the family.
    const news = input.records.filter((r) => {
      const prev = before.get(r.studentId);
      return (r.status === 'RESUBMIT' && prev?.status !== 'RESUBMIT') || (r.status === 'REVIEWED' && prev?.status !== 'REVIEWED');
    });
    for (const r of news) {
      const parentIds = await this.recipients.parentUserIds(auth.schoolId, { studentIds: [r.studentId] });
      await this.notifications.notify({
        schoolId: auth.schoolId,
        userIds: parentIds,
        title: r.status === 'RESUBMIT' ? `${LABEL[kind].one} needs redoing: ${c.title}` : `${LABEL[kind].one} reviewed: ${c.title}`,
        body: `${c.subject.name}${r.marks !== undefined && r.marks !== null ? ` · ${r.marks}${c.maxMarks ? `/${c.maxMarks}` : ''}` : ''}${r.feedback ? ` — ${r.feedback}` : ''}`,
        link: '/dashboard/my-children',
      });
    }
    return this.detail(auth, kind, id);
  }

  // -- Files ---------------------------------------------------------------------------------

  async listFiles(auth: AuthContext, kind: CourseworkKind, id: string) {
    await this.load(auth, kind, id);
    return this.attachments.list(auth.schoolId, COURSEWORK_FILES, id);
  }

  async uploadFile(auth: AuthContext, kind: CourseworkKind, id: string, file: Express.Multer.File | undefined) {
    await this.load(auth, kind, id);
    return this.attachments.upload(auth.schoolId, COURSEWORK_FILES, id, auth.userId, file);
  }

  async removeFile(auth: AuthContext, kind: CourseworkKind, id: string, documentId: string) {
    await this.load(auth, kind, id);
    return this.attachments.remove(auth.schoolId, COURSEWORK_FILES, id, documentId);
  }

  async openFile(auth: AuthContext, kind: CourseworkKind, id: string) {
    return this.load(auth, kind, id);
  }

  /** A student's submission row, created on demand — so a scan can be attached before anything is marked. */
  private async submissionFor(auth: AuthContext, kind: CourseworkKind, id: string, studentId: string) {
    const c = await this.load(auth, kind, id);
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId: auth.schoolId, ...this.rosterWhere(c) }, select: { id: true } });
    if (!student) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    return this.prisma.courseworkSubmission.upsert({ where: { courseworkId_studentId: { courseworkId: id, studentId } }, create: { schoolId: auth.schoolId, courseworkId: id, studentId }, update: {} });
  }

  async submissionFiles(auth: AuthContext, kind: CourseworkKind, id: string, studentId: string) {
    const sub = await this.submissionFor(auth, kind, id, studentId);
    return { submissionId: sub.id, files: await this.attachments.list(auth.schoolId, SUBMISSION_FILES, sub.id) };
  }

  async uploadSubmissionFile(auth: AuthContext, kind: CourseworkKind, id: string, studentId: string, file: Express.Multer.File | undefined) {
    const sub = await this.submissionFor(auth, kind, id, studentId);
    const doc = await this.attachments.upload(auth.schoolId, SUBMISSION_FILES, sub.id, auth.userId, file);
    if (sub.status === 'PENDING') await this.prisma.courseworkSubmission.update({ where: { id: sub.id }, data: { status: 'SUBMITTED', submittedAt: new Date() } });
    return doc;
  }

  async submissionFileOwner(auth: AuthContext, kind: CourseworkKind, id: string, studentId: string) {
    return this.submissionFor(auth, kind, id, studentId);
  }
}
