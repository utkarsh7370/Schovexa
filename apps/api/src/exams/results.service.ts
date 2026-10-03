import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthContext } from '../authorization/authorization.types';
import { GradingService } from '../grading/grading.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeachingScopeService } from '../teaching/teaching-scope.service';
import { dateOnlyToIso } from '../common/dates.util';

// A student's published results, subject by subject — what a parent sees for their child, and what a
// teacher sees when they look at how one of their students is doing. Only PUBLISHED marks ever appear:
// work still in review isn't a result yet.
@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: TeachingScopeService,
    private readonly grading: GradingService,
  ) {}

  async forStudent(auth: AuthContext, studentId: string) {
    const scope = await this.scopeService.resolve(auth);
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId: auth.schoolId, deletedAt: null }, select: { id: true, firstName: true, lastName: true, admissionNo: true, sectionId: true } });
    if (!student || !scope.canSeeStudent(student)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });

    const [marks, grading] = await Promise.all([
      this.prisma.mark.findMany({
        where: { studentId, schoolId: auth.schoolId, paper: { status: 'PUBLISHED' } },
        include: { paper: { select: { maxMarks: true, date: true, subject: { select: { id: true, name: true } }, exam: { select: { id: true, name: true, startDate: true } } } } },
      }),
      this.grading.get(auth.schoolId),
    ]);
    const byExam = new Map<string, { examId: string; name: string; startDate: string; subjects: { subject: string; subjectId: string; marks: number | null; absent: boolean; maxMarks: number; percent: number | null; grade: string | null; passed: boolean | null; remark: string | null }[] }>();
    for (const m of marks) {
      const e = byExam.get(m.paper.exam.id) ?? { examId: m.paper.exam.id, name: m.paper.exam.name, startDate: dateOnlyToIso(m.paper.exam.startDate), subjects: [] };
      const percent = m.marks === null ? null : Math.round((m.marks / m.paper.maxMarks) * 1000) / 10;
      const band = percent === null ? null : [...grading.bands].sort((a, b) => b.minPercent - a.minPercent).find((b) => percent >= b.minPercent);
      e.subjects.push({ subject: m.paper.subject.name, subjectId: m.paper.subject.id, marks: m.marks, absent: m.absent, maxMarks: m.paper.maxMarks, percent, grade: band?.label ?? null, passed: percent === null ? null : percent >= grading.passPercent, remark: m.remark });
      byExam.set(e.examId, e);
    }
    const exams = [...byExam.values()].sort((a, b) => (a.startDate < b.startDate ? 1 : -1)).map((e) => {
      const scored = e.subjects.filter((s) => s.percent !== null);
      const total = scored.reduce((n, s) => n + (s.marks ?? 0), 0);
      const max = scored.reduce((n, s) => n + s.maxMarks, 0);
      return { ...e, subjects: e.subjects.sort((a, b) => a.subject.localeCompare(b.subject)), totalMarks: total, totalMax: max, percent: max ? Math.round((total / max) * 1000) / 10 : null };
    });
    return { student: { id: student.id, name: `${student.firstName} ${student.lastName}`.trim(), admissionNo: student.admissionNo }, passPercent: grading.passPercent, exams };
  }
}
