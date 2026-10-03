import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../authorization/authorization.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeachingScopeService } from '../teaching/teaching-scope.service';
import { PAPER_INCLUDE } from './exams.service';

interface Meta {
  ipAddress: string | null;
  userAgent: string | null;
}

const INCLUDE = { paper: { include: PAPER_INCLUDE } } satisfies Prisma.MarkCorrectionInclude;
type Row = Prisma.MarkCorrectionGetPayload<{ include: typeof INCLUDE }>;

// "Request correction → approval → modify → audit log". Asking is the teacher's right; deciding is an
// approver's (marks.approve). Approval reopens the paper for exactly one more round of edits and submit.
@Injectable()
export class MarkCorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: TeachingScopeService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private async names(ids: (string | null)[]) {
    const real = [...new Set(ids.filter((i): i is string => !!i))];
    const users = await this.prisma.user.findMany({ where: { id: { in: real } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  }

  private toDto(c: Row, names: Map<string, string>) {
    return {
      id: c.id,
      status: c.status,
      reason: c.reason,
      decisionNote: c.decisionNote,
      createdAt: c.createdAt,
      decidedAt: c.decidedAt,
      requestedBy: names.get(c.requestedById) ?? null,
      requestedById: c.requestedById,
      decidedBy: c.decidedById ? (names.get(c.decidedById) ?? null) : null,
      paper: { id: c.paper.id, exam: c.paper.exam.name, subject: c.paper.subject.name, section: `${c.paper.section.class.name} – ${c.paper.section.name}`, status: c.paper.status },
    };
  }

  async request(auth: AuthContext, paperId: string, reason: string, meta: Meta) {
    const scope = await this.scopeService.resolve(auth);
    const paper = await this.prisma.examPaper.findFirst({ where: { id: paperId, schoolId: auth.schoolId }, include: PAPER_INCLUDE });
    if (!paper || !scope.canTeach(paper.sectionId, paper.subjectId)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    if (paper.status === 'DRAFT' || paper.status === 'CORRECTION') throw new ConflictException({ code: 'STILL_EDITABLE', message: 'These marks are still open — change them directly.' });
    const open = await this.prisma.markCorrection.findFirst({ where: { paperId, status: 'REQUESTED' } });
    if (open) throw new ConflictException({ code: 'ALREADY_REQUESTED', message: 'A correction for these marks is already waiting for a decision.' });
    const created = await this.prisma.markCorrection.create({ data: { schoolId: auth.schoolId, paperId, reason, requestedById: auth.userId }, include: INCLUDE });
    await this.audit.record({ schoolId: auth.schoolId, userId: auth.userId, action: 'marks.correction.requested', module: 'marks', resourceType: 'ExamPaper', resourceId: paperId, metadata: { reason, status: paper.status }, ...meta });
    const approvers = (await this.notifications.usersWithPermission(auth.schoolId, 'marks.approve')).filter((u) => u.id !== auth.userId);
    await this.notifications.notify({ schoolId: auth.schoolId, userIds: approvers.map((u) => u.id), title: 'Marks correction requested', body: `${paper.exam.name} · ${paper.subject.name} · ${paper.section.class.name} – ${paper.section.name}: ${reason}`, link: '/dashboard/marks?tab=review' });
    return this.toDto(created, await this.names([auth.userId]));
  }

  async list(auth: AuthContext, status: string | undefined) {
    const scope = await this.scopeService.resolve(auth);
    const rows = await this.prisma.markCorrection.findMany({
      where: { schoolId: auth.schoolId, paper: scope.pairWhere(), ...(scope.all ? {} : { requestedById: auth.userId }), ...(status && ['REQUESTED', 'APPROVED', 'REJECTED'].includes(status) ? { status: status as 'REQUESTED' | 'APPROVED' | 'REJECTED' } : {}) },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const names = await this.names(rows.flatMap((r) => [r.requestedById, r.decidedById]));
    return rows.map((r) => this.toDto(r, names));
  }

  private async one(auth: AuthContext, id: string): Promise<Row> {
    const row = await this.prisma.markCorrection.findFirst({ where: { id, schoolId: auth.schoolId }, include: INCLUDE });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    if (row.status !== 'REQUESTED') throw new ConflictException({ code: 'WRONG_STATUS', message: 'This request has already been decided.' });
    if (row.requestedById === auth.userId) throw new ForbiddenException({ code: 'CANNOT_APPROVE_OWN', message: 'You can’t decide a correction you asked for — someone else has to.' });
    return row;
  }

  async approve(auth: AuthContext, id: string, note: string | undefined, meta: Meta) {
    const row = await this.one(auth, id);
    await this.prisma.$transaction([
      this.prisma.markCorrection.update({ where: { id }, data: { status: 'APPROVED', decidedById: auth.userId, decidedAt: new Date(), decisionNote: note || null } }),
      // Reopened — and pulled back from the results families see until it has been checked and approved again.
      this.prisma.examPaper.update({ where: { id: row.paperId }, data: { status: 'CORRECTION', publishedAt: null, approvedAt: null, approvedById: null, reviewedAt: null, reviewedById: null } }),
    ]);
    await this.audit.record({ schoolId: auth.schoolId, userId: auth.userId, action: 'marks.correction.approved', module: 'marks', resourceType: 'ExamPaper', resourceId: row.paperId, metadata: { reason: row.reason, note: note ?? null, wasStatus: row.paper.status }, ...meta });
    await this.notifications.notify({ schoolId: auth.schoolId, userIds: [row.requestedById], title: 'Marks correction approved', body: `${row.paper.exam.name} · ${row.paper.subject.name} is open — make the change and submit again.`, link: '/dashboard/marks' });
    return this.toDto(await this.prisma.markCorrection.findUniqueOrThrow({ where: { id }, include: INCLUDE }), await this.names([row.requestedById, auth.userId]));
  }

  async reject(auth: AuthContext, id: string, note: string, meta: Meta) {
    const row = await this.one(auth, id);
    await this.prisma.markCorrection.update({ where: { id }, data: { status: 'REJECTED', decidedById: auth.userId, decidedAt: new Date(), decisionNote: note } });
    await this.audit.record({ schoolId: auth.schoolId, userId: auth.userId, action: 'marks.correction.rejected', module: 'marks', resourceType: 'ExamPaper', resourceId: row.paperId, metadata: { reason: row.reason, note }, ...meta });
    await this.notifications.notify({ schoolId: auth.schoolId, userIds: [row.requestedById], title: 'Marks correction rejected', body: `${row.paper.exam.name} · ${row.paper.subject.name}: ${note}`, link: '/dashboard/marks' });
    return this.toDto(await this.prisma.markCorrection.findUniqueOrThrow({ where: { id }, include: INCLUDE }), await this.names([row.requestedById, auth.userId]));
  }
}
