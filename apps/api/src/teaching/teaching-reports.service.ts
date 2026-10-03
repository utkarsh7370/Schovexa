import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../authorization/authorization.types';
import { col, EXPORT_FORMATS, renderReport, sumOf } from '../common/tabular-report';
import type { ExportFormat, ReportRow, TabularReport } from '../common/tabular-report';
import { dateOnlyToIso } from '../common/dates.util';
import { GradingService } from '../grading/grading.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolSettingsService } from '../school-settings/school-settings.service';
import { SchoolClockService } from './school-clock.service';
import { TeachingScopeService } from './teaching-scope.service';

export const TEACHING_REPORT_KINDS = ['class-attendance', 'student-performance', 'exam-performance', 'subject-marks', 'homework-completion', 'assignment-completion', 'class-trends', 'student-list'] as const;
export type TeachingReportKind = (typeof TEACHING_REPORT_KINDS)[number];

export interface TeachingReportFilters {
  from?: string;
  to?: string;
  sectionId?: string;
  subjectId?: string;
  examId?: string;
}

interface Meta {
  ipAddress: string | null;
  userAgent: string | null;
}

const TITLES: Record<TeachingReportKind, string> = {
  'class-attendance': 'Class attendance',
  'student-performance': 'Student performance',
  'exam-performance': 'Exam performance',
  'subject-marks': 'Subject-wise marks',
  'homework-completion': 'Homework completion',
  'assignment-completion': 'Assignment completion',
  'class-trends': 'Class performance over time',
  'student-list': 'Student list',
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const label = (s: { name: string; class: { name: string } }) => `${s.class.name} – ${s.name}`;

// The reports a teacher needs about their own classes — attendance, how work is getting handed in, how
// marks are looking — and nothing school-wide. Every figure is limited to the sections (and, for marks and
// coursework, the section+subject pairs) the person teaches; an administrator sees the whole school.
// They share the report shape used by Finance, so screen, CSV, Excel and PDF always agree.
@Injectable()
export class TeachingReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: TeachingScopeService,
    private readonly clock: SchoolClockService,
    private readonly grading: GradingService,
    private readonly settings: SchoolSettingsService,
    private readonly audit: AuditService,
  ) {}

  static isKind(v: string): v is TeachingReportKind {
    return (TEACHING_REPORT_KINDS as readonly string[]).includes(v);
  }

  async run(auth: AuthContext, kind: TeachingReportKind, f: TeachingReportFilters): Promise<TabularReport> {
    const scope = await this.scopeService.resolve(auth);
    if (f.sectionId) scope.assertSection(f.sectionId);
    const schoolId = auth.schoolId;
    const today = await this.clock.today(schoolId);
    const from = f.from ?? SchoolClockService.shift(today, -30);
    const to = f.to ?? today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '“from” and “to” must be dates, and “to” can’t be before “from”.' });
    const base = { title: TITLES[kind], generatedAt: new Date().toISOString(), note: null as string | null };
    const sectionScope = { ...scope.sectionWhere(), ...(f.sectionId ? { sectionId: f.sectionId } : {}) };
    const studentScope: Prisma.StudentWhereInput = { schoolId, deletedAt: null, ...scope.studentWhere(), ...(f.sectionId ? { sectionId: f.sectionId } : {}) };
    const pairScope = { ...scope.pairWhere(), ...(f.sectionId ? { sectionId: f.sectionId } : {}), ...(f.subjectId ? { subjectId: f.subjectId } : {}) };

    switch (kind) {
      case 'class-attendance': {
        const students = await this.prisma.student.findMany({ where: studentScope, select: { id: true, admissionNo: true, rollNo: true, firstName: true, lastName: true, section: { select: { name: true, class: { select: { name: true } } } } }, orderBy: [{ sectionId: 'asc' }, { admissionNo: 'asc' }], take: 5000 });
        const counts = await this.prisma.attendance.groupBy({ by: ['studentId', 'status'], where: { schoolId, ...sectionScope, studentId: { in: students.map((s) => s.id) }, date: { gte: new Date(from), lte: new Date(to) } }, _count: { _all: true } });
        const by = new Map<string, Record<string, number>>();
        for (const c of counts) by.set(c.studentId, { ...(by.get(c.studentId) ?? {}), [c.status]: c._count._all });
        const minPercent = (await this.settings.get(schoolId)).attendanceMinPercent;
        const rows = students.map((s) => {
          const c = by.get(s.id) ?? {};
          const total = Object.values(c).reduce((n, v) => n + v, 0);
          const attended = (c.PRESENT ?? 0) + (c.LATE ?? 0) + (c.HALF_DAY ?? 0) * 0.5;
          return { section: s.section ? label(s.section) : '—', rollNo: s.rollNo, admissionNo: s.admissionNo, student: `${s.firstName} ${s.lastName}`.trim(), present: c.PRESENT ?? 0, absent: c.ABSENT ?? 0, late: c.LATE ?? 0, halfDay: c.HALF_DAY ?? 0, excused: c.EXCUSED ?? 0, total, percent: total ? round1((attended / total) * 100) : null };
        });
        const low = rows.filter((r) => r.percent !== null && r.percent < minPercent).length;
        return { ...base, columns: [col('section', 'Class'), col('rollNo', 'Roll no.'), col('admissionNo', 'Admission no.'), col('student', 'Student'), col('present', 'Present', 'number'), col('absent', 'Absent', 'number'), col('late', 'Late', 'number'), col('halfDay', 'Half day', 'number'), col('excused', 'Excused', 'number'), col('total', 'Days marked', 'number'), col('percent', 'Attendance', 'percent')], rows, totals: [{ label: 'Students', value: rows.length, type: 'number' }, { label: `Below ${minPercent}%`, value: low, type: 'number' }], note: `${from} to ${to}. Attendance counts present, late and half days (as half).` };
      }

      case 'student-list': {
        const showContact = scope.all || (await this.settings.get(schoolId)).teachersSeeParentContact;
        const students = await this.prisma.student.findMany({ where: studentScope, select: { admissionNo: true, rollNo: true, firstName: true, lastName: true, gender: true, status: true, section: { select: { name: true, class: { select: { name: true } } } }, parents: { select: { isPrimary: true, parent: { select: { firstName: true, lastName: true, phone: true } } }, orderBy: { isPrimary: 'desc' }, take: 1 } }, orderBy: [{ sectionId: 'asc' }, { admissionNo: 'asc' }], take: 5000 });
        const rows = students.map((s) => ({ section: s.section ? label(s.section) : '—', rollNo: s.rollNo, admissionNo: s.admissionNo, student: `${s.firstName} ${s.lastName}`.trim(), gender: s.gender, status: s.status, parent: s.parents[0] ? `${s.parents[0].parent.firstName} ${s.parents[0].parent.lastName}`.trim() : null, ...(showContact ? { parentPhone: s.parents[0]?.parent.phone ?? null } : {}) }));
        return { ...base, columns: [col('section', 'Class'), col('rollNo', 'Roll no.'), col('admissionNo', 'Admission no.'), col('student', 'Student'), col('gender', 'Gender'), col('status', 'Status'), col('parent', 'Parent'), ...(showContact ? [col('parentPhone', 'Parent phone')] : [])], rows, totals: [{ label: 'Students', value: rows.length, type: 'number' }] };
      }

      case 'homework-completion':
      case 'assignment-completion': {
        const isHw = kind === 'homework-completion';
        const work = await this.prisma.coursework.findMany({ where: { schoolId, kind: isHw ? 'HOMEWORK' : 'ASSIGNMENT', status: { not: 'CANCELLED' }, dueDate: { gte: new Date(from), lte: new Date(to) }, ...pairScope }, select: { id: true, title: true, dueDate: true, sectionId: true, studentIds: true, maxMarks: true, section: { select: { name: true, class: { select: { name: true } } } }, subject: { select: { name: true } } }, orderBy: { dueDate: 'desc' }, take: 1000 });
        const subs = await this.prisma.courseworkSubmission.groupBy({ by: ['courseworkId', 'status'], where: { courseworkId: { in: work.map((w) => w.id) } }, _count: { _all: true } });
        const sizes = new Map((await this.prisma.student.groupBy({ by: ['sectionId'], where: { schoolId, sectionId: { in: [...new Set(work.map((w) => w.sectionId))] }, deletedAt: null }, _count: { _all: true } })).filter((g) => g.sectionId).map((g) => [g.sectionId as string, g._count._all]));
        const st = new Map<string, Record<string, number>>();
        for (const s of subs) st.set(s.courseworkId, { ...(st.get(s.courseworkId) ?? {}), [s.status]: s._count._all });
        const marks = isHw ? new Map<string, number | null>() : new Map((await this.prisma.courseworkSubmission.groupBy({ by: ['courseworkId'], where: { courseworkId: { in: work.map((w) => w.id) }, marks: { not: null } }, _avg: { marks: true } })).map((g) => [g.courseworkId, g._avg.marks]));
        const rows = work.map((w) => {
          const c = st.get(w.id) ?? {};
          const students = w.studentIds.length || sizes.get(w.sectionId) || 0;
          const handedIn = (c.SUBMITTED ?? 0) + (c.REVIEWED ?? 0) + (c.RESUBMIT ?? 0);
          return { title: w.title, section: label(w.section), subject: w.subject.name, dueDate: dateOnlyToIso(w.dueDate), students, handedIn, reviewed: c.REVIEWED ?? 0, notYet: Math.max(students - handedIn, 0), completion: students ? round1((handedIn / students) * 100) : null, ...(isHw ? {} : { average: marks.get(w.id) == null ? null : round1(marks.get(w.id) as number), maxMarks: w.maxMarks }) };
        });
        return { ...base, columns: [col('title', 'Title'), col('section', 'Class'), col('subject', 'Subject'), col('dueDate', 'Due', 'date'), col('students', 'Students', 'number'), col('handedIn', 'Handed in', 'number'), col('reviewed', 'Reviewed', 'number'), col('notYet', 'Not yet', 'number'), col('completion', 'Completion', 'percent'), ...(isHw ? [] : [col('average', 'Average marks', 'number'), col('maxMarks', 'Out of', 'number')])], rows, totals: [{ label: isHw ? 'Homework set' : 'Assignments set', value: rows.length, type: 'number' }], note: `Due ${from} to ${to}.` };
      }

      case 'exam-performance':
      case 'class-trends': {
        const papers = await this.prisma.examPaper.findMany({ where: { schoolId, exam: { deletedAt: null, ...(f.examId ? { id: f.examId } : {}) }, ...pairScope }, include: { exam: { select: { name: true, startDate: true } }, section: { select: { name: true, class: { select: { name: true } } } }, subject: { select: { name: true } }, marks: { select: { marks: true, absent: true } }, _count: { select: { marks: true } } }, take: 500 });
        const pass = (await this.grading.get(schoolId)).passPercent;
        const rows = papers
          .map((p) => {
            const scored = p.marks.filter((m) => m.marks !== null).map((m) => m.marks as number);
            const avg = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null;
            const passed = scored.filter((m) => (m / p.maxMarks) * 100 >= pass).length;
            return { exam: p.exam.name, startDate: dateOnlyToIso(p.exam.startDate), section: label(p.section), subject: p.subject.name, status: p.status, entered: p.marks.length, absent: p.marks.filter((m) => m.absent).length, average: avg === null ? null : round1(avg), averagePercent: avg === null ? null : round1((avg / p.maxMarks) * 100), highest: scored.length ? Math.max(...scored) : null, lowest: scored.length ? Math.min(...scored) : null, passPercent: scored.length ? round1((passed / scored.length) * 100) : null, maxMarks: p.maxMarks };
          })
          .sort((a, b) => (kind === 'class-trends' ? (a.startDate < b.startDate ? -1 : 1) : a.startDate < b.startDate ? 1 : -1) || a.subject.localeCompare(b.subject));
        if (kind === 'class-trends') {
          return { ...base, columns: [col('exam', 'Exam'), col('startDate', 'Starts', 'date'), col('section', 'Class'), col('subject', 'Subject'), col('averagePercent', 'Average', 'percent'), col('passPercent', 'Passed', 'percent')], rows, totals: [], note: 'Oldest first, so you can see whether a class is improving.' };
        }
        return { ...base, columns: [col('exam', 'Exam'), col('section', 'Class'), col('subject', 'Subject'), col('status', 'Marks status'), col('entered', 'Marks entered', 'number'), col('absent', 'Absent', 'number'), col('average', 'Average', 'number'), col('highest', 'Highest', 'number'), col('lowest', 'Lowest', 'number'), col('maxMarks', 'Out of', 'number'), col('passPercent', 'Passed', 'percent')], rows, totals: [{ label: 'Papers', value: rows.length, type: 'number' }] };
      }

      case 'student-performance':
      case 'subject-marks': {
        // Published results only: marks still in review aren't results yet.
        const marks = await this.prisma.mark.findMany({ where: { schoolId, paper: { status: 'PUBLISHED', exam: { deletedAt: null, ...(f.examId ? { id: f.examId } : {}) }, ...pairScope }, student: studentScope }, select: { marks: true, absent: true, student: { select: { id: true, admissionNo: true, rollNo: true, firstName: true, lastName: true, section: { select: { name: true, class: { select: { name: true } } } } } }, paper: { select: { maxMarks: true, exam: { select: { name: true } }, subject: { select: { name: true } } } } }, take: 50_000 });
        const grading = await this.grading.get(schoolId);
        const bands = [...grading.bands].sort((a, b) => b.minPercent - a.minPercent);
        const byStudent = new Map<string, { s: (typeof marks)[number]['student']; items: typeof marks }>();
        for (const m of marks) {
          const e = byStudent.get(m.student.id) ?? { s: m.student, items: [] };
          e.items.push(m);
          byStudent.set(m.student.id, e);
        }
        if (kind === 'subject-marks') {
          const subjects = [...new Set(marks.map((m) => m.paper.subject.name))].sort();
          const rows: ReportRow[] = [...byStudent.values()].map(({ s, items }) => {
            const row: ReportRow = { rollNo: s.rollNo, admissionNo: s.admissionNo, student: `${s.firstName} ${s.lastName}`.trim(), section: s.section ? label(s.section) : '—' };
            let total = 0;
            let max = 0;
            for (const sub of subjects) {
              const it = items.filter((i) => i.paper.subject.name === sub && i.marks !== null);
              const got = it.reduce((n, i) => n + (i.marks ?? 0), 0);
              const outOf = it.reduce((n, i) => n + i.paper.maxMarks, 0);
              row[`subject:${sub}`] = outOf ? round1((got / outOf) * 100) : null;
              total += got;
              max += outOf;
            }
            row.overall = max ? round1((total / max) * 100) : null;
            return row;
          });
          rows.sort((a, b) => String(a.section).localeCompare(String(b.section)) || String(a.admissionNo).localeCompare(String(b.admissionNo)));
          return { ...base, columns: [col('section', 'Class'), col('rollNo', 'Roll no.'), col('admissionNo', 'Admission no.'), col('student', 'Student'), ...subjects.map((s) => col(`subject:${s}`, s, 'percent')), col('overall', 'Overall', 'percent')], rows, totals: [{ label: 'Students', value: rows.length, type: 'number' }], note: 'Each subject is shown as a percentage of its marks, published results only.' };
        }
        const rows = [...byStudent.values()].map(({ s, items }) => {
          const scored = items.filter((i) => i.marks !== null);
          const got = scored.reduce((n, i) => n + (i.marks ?? 0), 0);
          const max = scored.reduce((n, i) => n + i.paper.maxMarks, 0);
          const percent = max ? round1((got / max) * 100) : null;
          const best = [...scored].sort((a, b) => (b.marks ?? 0) / b.paper.maxMarks - (a.marks ?? 0) / a.paper.maxMarks)[0];
          const weak = [...scored].sort((a, b) => (a.marks ?? 0) / a.paper.maxMarks - (b.marks ?? 0) / b.paper.maxMarks)[0];
          return { section: s.section ? label(s.section) : '—', rollNo: s.rollNo, admissionNo: s.admissionNo, student: `${s.firstName} ${s.lastName}`.trim(), papers: scored.length, percent, grade: percent === null ? null : (bands.find((b) => percent >= b.minPercent)?.label ?? null), strongest: best ? best.paper.subject.name : null, weakest: weak && weak !== best ? weak.paper.subject.name : null };
        }).sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1));
        return { ...base, columns: [col('section', 'Class'), col('rollNo', 'Roll no.'), col('admissionNo', 'Admission no.'), col('student', 'Student'), col('papers', 'Papers', 'number'), col('percent', 'Average', 'percent'), col('grade', 'Grade'), col('strongest', 'Strongest subject'), col('weakest', 'Needs attention')], rows, totals: [{ label: 'Students', value: rows.length, type: 'number' }, { label: 'Class average', value: rows.length ? round1(sumOf(rows as unknown as ReportRow[], 'percent') / Math.max(rows.filter((r) => r.percent !== null).length, 1)) : 0, type: 'percent' }], note: 'Published results only.' };
      }
    }
  }

  async export(auth: AuthContext, kind: TeachingReportKind, format: ExportFormat, f: TeachingReportFilters, meta: Meta) {
    if (!EXPORT_FORMATS.includes(format)) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Choose csv, xlsx or pdf.' });
    const report = await this.run(auth, kind, f);
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: auth.schoolId }, select: { name: true } });
    const { buffer, contentType } = await renderReport(report, format, school.name);
    await this.audit.record({ schoolId: auth.schoolId, userId: auth.userId, action: 'teaching.export', module: 'teachingReport', resourceType: 'TeachingReport', resourceId: kind, metadata: { report: kind, format, rows: report.rows.length, filters: JSON.parse(JSON.stringify(f)) as Prisma.InputJsonValue }, ...meta });
    return { buffer, contentType, filename: `${kind}-${dateOnlyToIso(new Date())}.${format}` };
  }
}
