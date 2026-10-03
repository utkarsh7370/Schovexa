import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { MarksStatus, Prisma } from '@prisma/client';
import type { SaveMarksInput } from '@schovexa/validation';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../authorization/authorization.types';
import { GradingService } from '../grading/grading.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecipientsService } from '../teaching/recipients.service';
import { TeachingScopeService } from '../teaching/teaching-scope.service';
import { PAPER_INCLUDE, paperDto } from './exams.service';
import type { PaperRow } from './exams.service';

interface Meta {
  ipAddress: string | null;
  userAgent: string | null;
}

const EDITABLE: MarksStatus[] = ['DRAFT', 'CORRECTION'];
const PAGE = '/dashboard/marks';

// Marks, and the road they travel before anyone outside the school can see them:
//
//   teacher enters → submits → coordinator reviews → principal approves → published
//
// After "submit" the teacher can no longer change a mark. If one turns out to be wrong they ASK
// (a correction request with a reason); an approver reopens the paper; and every change made while
// it is open is written to the audit log with the old and new value. Nobody approves their own work.
@Injectable()
export class MarksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: TeachingScopeService,
    private readonly grading: GradingService,
    private readonly notifications: NotificationsService,
    private readonly recipients: RecipientsService,
    private readonly audit: AuditService,
  ) {}

  /** The paper, only if this person may see it (their subject, in their section) — otherwise a 404. */
  async load(auth: AuthContext, paperId: string): Promise<PaperRow> {
    const scope = await this.scopeService.resolve(auth);
    const paper = await this.prisma.examPaper.findFirst({ where: { id: paperId, schoolId: auth.schoolId }, include: PAPER_INCLUDE });
    if (!paper || !scope.canTeach(paper.sectionId, paper.subjectId)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    return paper;
  }

  async detail(auth: AuthContext, paperId: string) {
    const paper = await this.load(auth, paperId);
    const [students, marks, grading, corrections] = await Promise.all([
      this.prisma.student.findMany({ where: { schoolId: auth.schoolId, sectionId: paper.sectionId, deletedAt: null }, select: { id: true, firstName: true, lastName: true, admissionNo: true, rollNo: true }, orderBy: { admissionNo: 'asc' } }),
      this.prisma.mark.findMany({ where: { paperId } }),
      this.grading.get(auth.schoolId),
      this.prisma.markCorrection.findMany({ where: { paperId }, orderBy: { createdAt: 'desc' }, take: 5 }),
    ]);
    const byStudent = new Map(marks.map((m) => [m.studentId, m]));
    const rows = students.map((s) => {
      const m = byStudent.get(s.id);
      return { studentId: s.id, name: `${s.firstName} ${s.lastName}`.trim(), admissionNo: s.admissionNo, rollNo: s.rollNo, marks: m?.marks ?? null, absent: m?.absent ?? false, remark: m?.remark ?? null };
    });
    const entered = rows.filter((r) => r.marks !== null || r.absent).length;
    return {
      ...paperDto(paper),
      editable: EDITABLE.includes(paper.status),
      passPercent: grading.passPercent,
      roster: rows,
      progress: { students: rows.length, entered },
      corrections: corrections.map((c) => ({ id: c.id, status: c.status, reason: c.reason, decisionNote: c.decisionNote, createdAt: c.createdAt })),
    };
  }

  async save(auth: AuthContext, paperId: string, input: SaveMarksInput, meta: Meta) {
    const paper = await this.load(auth, paperId);
    if (!EDITABLE.includes(paper.status)) {
      throw new ConflictException({ code: 'MARKS_LOCKED', message: 'These marks have been submitted and are locked. Ask for a correction if one is wrong.' });
    }
    const ids = input.records.map((r) => r.studentId);
    const roster = await this.prisma.student.findMany({ where: { id: { in: ids }, schoolId: auth.schoolId, sectionId: paper.sectionId, deletedAt: null }, select: { id: true } });
    if (roster.length !== new Set(ids).size) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Some of those students aren’t in this section.' });
    for (const r of input.records) {
      if (r.marks !== null && r.marks !== undefined && r.marks > paper.maxMarks) {
        throw new BadRequestException({ code: 'MARKS_ABOVE_MAXIMUM', message: `Marks can’t be more than ${paper.maxMarks}.`, details: [{ field: r.studentId, message: `Out of ${paper.maxMarks}` }] });
      }
      if (r.absent && r.marks !== null && r.marks !== undefined) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'A student marked absent can’t also have marks.' });
    }

    const before = await this.prisma.mark.findMany({ where: { paperId, studentId: { in: ids } } });
    const was = new Map(before.map((m) => [m.studentId, m]));
    await this.prisma.$transaction(
      input.records.map((r) => {
        const data = { marks: r.absent ? null : (r.marks ?? null), absent: !!r.absent, remark: r.remark || null, updatedById: auth.userId };
        return this.prisma.mark.upsert({ where: { paperId_studentId: { paperId, studentId: r.studentId } }, create: { schoolId: auth.schoolId, paperId, studentId: r.studentId, ...data }, update: data });
      }),
    );

    // While a paper is reopened for correction, every change is on the record: who, which student, from what to what.
    if (paper.status === 'CORRECTION') {
      const changes = input.records
        .map((r) => ({ studentId: r.studentId, from: was.get(r.studentId), to: { marks: r.absent ? null : (r.marks ?? null), absent: !!r.absent } }))
        .filter((c) => (c.from?.marks ?? null) !== c.to.marks || (c.from?.absent ?? false) !== c.to.absent);
      for (const c of changes) {
        await this.audit.record({ schoolId: auth.schoolId, userId: auth.userId, action: 'marks.changed', module: 'marks', resourceType: 'ExamPaper', resourceId: paperId, metadata: { studentId: c.studentId, before: { marks: c.from?.marks ?? null, absent: c.from?.absent ?? false }, after: c.to }, ...meta });
      }
    }
    return this.detail(auth, paperId);
  }

  private async transition(auth: AuthContext, paper: PaperRow, to: MarksStatus, data: Prisma.ExamPaperUpdateInput, action: string, meta: Meta, extra: Record<string, unknown> = {}) {
    await this.prisma.examPaper.update({ where: { id: paper.id }, data: { status: to, ...data } });
    await this.audit.record({ schoolId: auth.schoolId, userId: auth.userId, action, module: 'marks', resourceType: 'ExamPaper', resourceId: paper.id, metadata: { from: paper.status, to, exam: paper.exam.name, subject: paper.subject.name, section: paper.section.name, ...extra }, ...meta });
  }

  private label(p: PaperRow) {
    return `${p.exam.name} · ${p.subject.name} · ${p.section.class.name} – ${p.section.name}`;
  }

  async submit(auth: AuthContext, paperId: string, meta: Meta) {
    const paper = await this.load(auth, paperId);
    if (!EDITABLE.includes(paper.status)) throw new ConflictException({ code: 'WRONG_STATUS', message: 'These marks have already been submitted.' });
    const [students, entered] = await Promise.all([
      this.prisma.student.count({ where: { schoolId: auth.schoolId, sectionId: paper.sectionId, deletedAt: null } }),
      this.prisma.mark.count({ where: { paperId, OR: [{ marks: { not: null } }, { absent: true }] } }),
    ]);
    if (students === 0) throw new BadRequestException({ code: 'NO_STUDENTS', message: 'This section has no students.' });
    if (entered < students) throw new BadRequestException({ code: 'MARKS_INCOMPLETE', message: `${students - entered} student${students - entered === 1 ? ' has' : 's have'} no marks yet. Enter marks (or mark them absent) for everyone before submitting.` });
    await this.transition(auth, paper, 'SUBMITTED', { submittedAt: new Date(), submittedById: auth.userId, reviewedAt: null, reviewedById: null, approvedAt: null, approvedById: null, publishedAt: null, returnNote: null }, 'marks.submitted', meta);
    const reviewers = (await this.notifications.usersWithPermission(auth.schoolId, 'marks.review')).filter((u) => u.id !== auth.userId);
    await this.notifications.notify({ schoolId: auth.schoolId, userIds: reviewers.map((u) => u.id), title: 'Marks submitted for review', body: this.label(paper), link: `${PAGE}?tab=review` });
    return this.detail(auth, paperId);
  }

  async review(auth: AuthContext, paperId: string, meta: Meta) {
    const paper = await this.load(auth, paperId);
    if (paper.status !== 'SUBMITTED') throw new ConflictException({ code: 'WRONG_STATUS', message: 'Only submitted marks can be reviewed.' });
    this.notOwnWork(paper, auth);
    await this.transition(auth, paper, 'REVIEWED', { reviewedAt: new Date(), reviewedById: auth.userId }, 'marks.reviewed', meta);
    const approvers = (await this.notifications.usersWithPermission(auth.schoolId, 'marks.approve')).filter((u) => u.id !== auth.userId);
    await this.notifications.notify({ schoolId: auth.schoolId, userIds: approvers.map((u) => u.id), title: 'Marks reviewed — ready to approve', body: this.label(paper), link: `${PAGE}?tab=review` });
    return this.detail(auth, paperId);
  }

  /** Sends a paper back to its teacher, with a reason. */
  async giveBack(auth: AuthContext, paperId: string, note: string, meta: Meta) {
    const paper = await this.load(auth, paperId);
    if (paper.status !== 'SUBMITTED' && paper.status !== 'REVIEWED') throw new ConflictException({ code: 'WRONG_STATUS', message: 'Only marks waiting for a decision can be sent back.' });
    this.notOwnWork(paper, auth);
    await this.transition(auth, paper, 'DRAFT', { returnNote: note, reviewedAt: null, reviewedById: null }, 'marks.returned', meta, { note });
    await this.notifyTeachers(auth, paper, 'Marks sent back', `${this.label(paper)} — ${note}`);
    return this.detail(auth, paperId);
  }

  /** Approves (and, for a school without a separate coordinator, reviews in the same step if the approver may). */
  async approve(auth: AuthContext, paperId: string, canReview: boolean, meta: Meta) {
    const paper = await this.load(auth, paperId);
    if (paper.status !== 'REVIEWED' && !(paper.status === 'SUBMITTED' && canReview)) {
      throw new ConflictException({ code: 'WRONG_STATUS', message: paper.status === 'SUBMITTED' ? 'These marks haven’t been reviewed yet.' : 'Only reviewed marks can be approved.' });
    }
    this.notOwnWork(paper, auth);
    await this.transition(auth, paper, 'APPROVED', { approvedAt: new Date(), approvedById: auth.userId, ...(paper.status === 'SUBMITTED' ? { reviewedAt: new Date(), reviewedById: auth.userId } : {}) }, 'marks.approved', meta);
    return this.detail(auth, paperId);
  }

  async publish(auth: AuthContext, paperId: string, meta: Meta) {
    const paper = await this.load(auth, paperId);
    if (paper.status !== 'APPROVED') throw new ConflictException({ code: 'WRONG_STATUS', message: 'Only approved marks can be published.' });
    await this.transition(auth, paper, 'PUBLISHED', { publishedAt: new Date() }, 'marks.published', meta);
    const parents = await this.recipients.parentUserIds(auth.schoolId, { sectionId: paper.sectionId });
    await this.notifications.notify({ schoolId: auth.schoolId, userIds: parents, title: `Results published: ${paper.subject.name}`, body: `${paper.exam.name} — see your child’s result.`, link: '/dashboard/my-children' });
    await this.notifyTeachers(auth, paper, 'Marks published', this.label(paper));
    return this.detail(auth, paperId);
  }

  private notOwnWork(paper: PaperRow, auth: AuthContext) {
    if (paper.submittedById === auth.userId) {
      throw new ForbiddenException({ code: 'CANNOT_APPROVE_OWN', message: 'You submitted these marks, so someone else has to review or approve them.' });
    }
  }

  private async notifyTeachers(auth: AuthContext, paper: PaperRow, title: string, body: string) {
    const teachers = await this.recipients.teacherUserIds(auth.schoolId, paper.section.id, paper.subject.id);
    await this.notifications.notify({ schoolId: auth.schoolId, userIds: teachers.map((t) => t.userId).filter((id) => id !== auth.userId), title, body, link: PAGE });
  }

  /** Papers waiting on a decision, for the review screen. */
  async queue(auth: AuthContext, status: string | undefined) {
    const scope = await this.scopeService.resolve(auth);
    const statuses: MarksStatus[] = status && ['SUBMITTED', 'REVIEWED', 'APPROVED', 'PUBLISHED', 'CORRECTION', 'DRAFT'].includes(status) ? [status as MarksStatus] : ['SUBMITTED', 'REVIEWED', 'APPROVED'];
    const papers = await this.prisma.examPaper.findMany({ where: { schoolId: auth.schoolId, status: { in: statuses }, ...scope.pairWhere() }, include: PAPER_INCLUDE, orderBy: { submittedAt: 'asc' } });
    return papers.map(paperDto);
  }

  /** The papers a teacher still owes marks for (draft or reopened), soonest exam first. */
  async mine(auth: AuthContext) {
    const scope = await this.scopeService.resolve(auth);
    const papers = await this.prisma.examPaper.findMany({ where: { schoolId: auth.schoolId, ...scope.pairWhere() }, include: PAPER_INCLUDE, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] });
    return papers.map(paperDto);
  }
}
