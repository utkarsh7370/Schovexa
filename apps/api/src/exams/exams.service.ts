import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateExamInput, CreateExamPaperInput } from '@schovexa/validation';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../authorization/authorization.types';
import { dateOnlyToIso } from '../common/dates.util';
import { PrismaService } from '../prisma/prisma.service';
import { TeachingScopeService } from '../teaching/teaching-scope.service';

export const PAPER_INCLUDE = {
  exam: { select: { id: true, name: true, startDate: true, endDate: true } },
  section: { select: { id: true, name: true, class: { select: { name: true } } } },
  subject: { select: { id: true, name: true } },
} satisfies Prisma.ExamPaperInclude;
export type PaperRow = Prisma.ExamPaperGetPayload<{ include: typeof PAPER_INCLUDE }>;

export function paperDto(p: PaperRow) {
  return {
    id: p.id,
    examId: p.examId,
    examName: p.exam.name,
    section: { id: p.section.id, name: `${p.section.class.name} – ${p.section.name}` },
    subject: p.subject,
    date: p.date ? dateOnlyToIso(p.date) : null,
    startTime: p.startTime,
    endTime: p.endTime,
    room: p.room,
    maxMarks: p.maxMarks,
    status: p.status,
    returnNote: p.returnNote,
    submittedAt: p.submittedAt,
    approvedAt: p.approvedAt,
    publishedAt: p.publishedAt,
  };
}

// Exams and the papers set in them (one paper = one exam × one section × one subject). Creating exams is
// an academic-office job (exam.manage); everyone else sees only the papers for the subjects they teach.
@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: TeachingScopeService,
    private readonly audit: AuditService,
  ) {}

  /** Exams with the papers this person can see — a teacher's exam timetable is just their own papers. */
  async list(auth: AuthContext, filter: { from?: string; to?: string }) {
    const scope = await this.scopeService.resolve(auth);
    const papers = await this.prisma.examPaper.findMany({
      where: { schoolId: auth.schoolId, exam: { deletedAt: null }, ...scope.pairWhere(), ...(filter.from || filter.to ? { exam: { deletedAt: null, ...(filter.to ? { startDate: { lte: new Date(filter.to) } } : {}), ...(filter.from ? { endDate: { gte: new Date(filter.from) } } : {}) } } : {}) },
      include: PAPER_INCLUDE,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    // Administrators also see exams that have no papers yet.
    const exams = await this.prisma.exam.findMany({
      where: { schoolId: auth.schoolId, deletedAt: null, ...(scope.all ? {} : { id: { in: [...new Set(papers.map((p) => p.examId))] } }), ...(filter.from ? { endDate: { gte: new Date(filter.from) } } : {}), ...(filter.to ? { startDate: { lte: new Date(filter.to) } } : {}) },
      orderBy: { startDate: 'desc' },
    });
    return exams.map((e) => ({
      id: e.id,
      name: e.name,
      academicYearId: e.academicYearId,
      startDate: dateOnlyToIso(e.startDate),
      endDate: dateOnlyToIso(e.endDate),
      papers: papers.filter((p) => p.examId === e.id).map(paperDto),
    }));
  }

  async create(auth: AuthContext, input: CreateExamInput) {
    const year = await this.prisma.academicYear.findFirst({ where: { id: input.academicYearId, schoolId: auth.schoolId, deletedAt: null }, select: { id: true } });
    if (!year) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown academic year.' });
    const exam = await this.prisma.exam.create({ data: { schoolId: auth.schoolId, academicYearId: year.id, name: input.name, startDate: new Date(input.startDate), endDate: new Date(input.endDate), createdById: auth.userId } });
    await this.audit.record({ schoolId: auth.schoolId, userId: auth.userId, action: 'exam.created', module: 'exam', resourceType: 'Exam', resourceId: exam.id, metadata: { name: exam.name } });
    return { id: exam.id, name: exam.name, startDate: input.startDate, endDate: input.endDate, papers: [] };
  }

  async remove(auth: AuthContext, id: string) {
    const exam = await this.prisma.exam.findFirst({ where: { id, schoolId: auth.schoolId, deletedAt: null }, include: { papers: { select: { status: true } } } });
    if (!exam) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    if (exam.papers.some((p) => p.status !== 'DRAFT')) throw new ConflictException({ code: 'HAS_MARKS', message: 'Marks have already been submitted for this exam, so it can’t be removed.' });
    await this.prisma.exam.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id };
  }

  async addPaper(auth: AuthContext, examId: string, input: CreateExamPaperInput) {
    const exam = await this.prisma.exam.findFirst({ where: { id: examId, schoolId: auth.schoolId, deletedAt: null } });
    if (!exam) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    // A paper only makes sense for a subject somebody actually teaches in that section.
    const taught = await this.prisma.teacherAssignment.findFirst({ where: { schoolId: auth.schoolId, sectionId: input.sectionId, subjectId: input.subjectId, deletedAt: null } });
    if (!taught) throw new BadRequestException({ code: 'NOT_ASSIGNED', message: 'Nobody is assigned to teach this subject in this section yet.' });
    if (input.date && (input.date < dateOnlyToIso(exam.startDate) || input.date > dateOnlyToIso(exam.endDate))) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'The paper’s date is outside the exam’s dates.' });
    }
    try {
      const paper = await this.prisma.examPaper.create({
        data: { schoolId: auth.schoolId, examId, sectionId: input.sectionId, subjectId: input.subjectId, date: input.date ? new Date(input.date) : null, startTime: input.startTime || null, endTime: input.endTime || null, room: input.room || null, maxMarks: input.maxMarks ?? 100 },
        include: PAPER_INCLUDE,
      });
      return paperDto(paper);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException({ code: 'ALREADY_EXISTS', message: 'This exam already has a paper for that subject and section.' });
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown section or subject.' });
      throw err;
    }
  }

  async updatePaper(auth: AuthContext, paperId: string, input: Partial<CreateExamPaperInput>) {
    const paper = await this.prisma.examPaper.findFirst({ where: { id: paperId, schoolId: auth.schoolId } });
    if (!paper) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    if (input.maxMarks !== undefined && paper.status !== 'DRAFT') throw new ConflictException({ code: 'LOCKED', message: 'The maximum marks can’t change once marks are submitted.' });
    const updated = await this.prisma.examPaper.update({
      where: { id: paperId },
      data: {
        ...(input.date !== undefined ? { date: input.date ? new Date(input.date) : null } : {}),
        ...(input.startTime !== undefined ? { startTime: input.startTime || null } : {}),
        ...(input.endTime !== undefined ? { endTime: input.endTime || null } : {}),
        ...(input.room !== undefined ? { room: input.room || null } : {}),
        ...(input.maxMarks !== undefined ? { maxMarks: input.maxMarks } : {}),
      },
      include: PAPER_INCLUDE,
    });
    return paperDto(updated);
  }

  async removePaper(auth: AuthContext, paperId: string) {
    const paper = await this.prisma.examPaper.findFirst({ where: { id: paperId, schoolId: auth.schoolId }, include: { _count: { select: { marks: true } } } });
    if (!paper) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    if (paper.status !== 'DRAFT' || paper._count.marks > 0) throw new ConflictException({ code: 'HAS_MARKS', message: 'Marks have been entered for this paper, so it can’t be removed.' });
    await this.prisma.examPaper.delete({ where: { id: paperId } });
    return { id: paperId };
  }
}
