import { Injectable } from '@nestjs/common';
import type { AuthContext } from '../authorization/authorization.types';
import { dateOnlyToIso, minutesOfDayInTimezone, hmToMinutes } from '../common/dates.util';
import { describeDayOff } from '../common/school-calendar.util';
import { EventsService } from '../events/events.service';
import { LeaveService } from '../leave/leave.service';
import { NoticesService } from '../notices/notices.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolSettingsService } from '../school-settings/school-settings.service';
import { TimetableService } from '../timetable/timetable.service';
import { SchoolClockService } from './school-clock.service';
import { TeachingScopeService } from './teaching-scope.service';


// "What do I need to do today?" — one request that answers it for the signed-in teacher: today's lessons, the
// register still to take, work to review, marks still owed, what's coming up, and anything waiting on them.
// Everything is limited to what THEY teach (their assignments), whatever else their role may be allowed.
@Injectable()
export class TeachingDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: TeachingScopeService,
    private readonly clock: SchoolClockService,
    private readonly timetable: TimetableService,
    private readonly settings: SchoolSettingsService,
    private readonly notices: NoticesService,
    private readonly events: EventsService,
    private readonly leave: LeaveService,
  ) {}

  async dashboard(auth: AuthContext) {
    const scope = await this.scopeService.resolveMine(auth);
    const schoolId = auth.schoolId;
    const [school, today] = await Promise.all([this.prisma.school.findUnique({ where: { id: schoolId }, select: { timezone: true } }), this.clock.today(schoolId)]);
    const soon = SchoolClockService.shift(today, 14);
    const [dayStatus] = await this.settings.dayStatuses(schoolId, today, today);
    const pairs = scope.pairWhere();
    const sectionIds = [...scope.sectionIds];
    const teacherId = scope.teacherId;

    const [lessons, assignments, classTeacherOf, studentCount, markedToday, hwRows, asgRows, papers, upcomingPapers, noticeList, events, holidays, unreadMessages, myCorrections, leaveInfo] = await Promise.all([
      teacherId ? this.timetable.lessonsFor(schoolId, teacherId, today) : Promise.resolve([]),
      teacherId ? this.prisma.teacherAssignment.findMany({ where: { teacherId, deletedAt: null, section: { deletedAt: null } }, select: { section: { select: { id: true, name: true, class: { select: { name: true } } } }, subject: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } }) : Promise.resolve([]),
      teacherId ? this.prisma.section.findMany({ where: { classTeacherId: teacherId, deletedAt: null }, select: { id: true, name: true, class: { select: { name: true } } } }) : Promise.resolve([]),
      sectionIds.length ? this.prisma.student.count({ where: { schoolId, sectionId: { in: sectionIds }, deletedAt: null } }) : Promise.resolve(0),
      sectionIds.length ? this.prisma.attendance.groupBy({ by: ['sectionId'], where: { schoolId, sectionId: { in: sectionIds }, date: new Date(today) }, _count: { _all: true } }) : Promise.resolve([]),
      // Homework and assignments that are still live, with how far along reviewing is.
      this.prisma.coursework.findMany({ where: { schoolId, kind: 'HOMEWORK', status: 'ACTIVE', ...pairs }, select: { id: true, title: true, dueDate: true, sectionId: true, studentIds: true, section: { select: { name: true, class: { select: { name: true } } } }, subject: { select: { name: true } }, submissions: { select: { status: true } } }, orderBy: { dueDate: 'asc' }, take: 200 }),
      this.prisma.coursework.findMany({ where: { schoolId, kind: 'ASSIGNMENT', status: 'ACTIVE', ...pairs }, select: { id: true, title: true, dueDate: true, section: { select: { name: true, class: { select: { name: true } } } }, subject: { select: { name: true } }, submissions: { select: { status: true } } }, orderBy: { dueDate: 'asc' }, take: 200 }),
      this.prisma.examPaper.findMany({ where: { schoolId, status: { in: ['DRAFT', 'CORRECTION'] }, exam: { deletedAt: null, startDate: { lte: new Date(today) } }, ...pairs }, select: { id: true, status: true, date: true, exam: { select: { name: true } }, subject: { select: { name: true } }, section: { select: { name: true, class: { select: { name: true } } } } }, take: 50 }),
      this.prisma.examPaper.findMany({ where: { schoolId, exam: { deletedAt: null }, date: { gte: new Date(today), lte: new Date(soon) }, ...pairs }, select: { id: true, date: true, startTime: true, room: true, exam: { select: { name: true } }, subject: { select: { name: true } }, section: { select: { name: true, class: { select: { name: true } } } } }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }], take: 6 }),
      this.notices.list(auth),
      this.events.list(auth, today, soon),
      this.prisma.holiday.findMany({ where: { schoolId, deletedAt: null, endDate: { gte: new Date(today) }, startDate: { lte: new Date(soon) } }, orderBy: { startDate: 'asc' }, take: 5 }),
      this.prisma.messageRecipient.count({ where: { userId: auth.userId, readAt: null, message: { schoolId } } }),
      this.prisma.attendanceCorrection.groupBy({ by: ['status'], where: { schoolId, requestedById: auth.userId }, _count: { _all: true } }),
      this.leave.mine(auth).catch(() => null),
    ]);

    const label = (s: { name: string; class: { name: string } }) => `${s.class.name} – ${s.name}`;
    const marked = new Set(markedToday.map((m) => m.sectionId));
    // The register is owed for the sections you are class teacher of; if you aren't one, for the classes you teach today.
    const registerSections = classTeacherOf.length > 0 ? classTeacherOf.map((s) => ({ id: s.id, name: label(s) })) : [...new Map(lessons.filter((l) => l.kind !== 'COVERED').map((l) => [l.section.id, { id: l.section.id, name: l.section.name }])).values()];
    const attendancePending = dayStatus.working ? registerSections.filter((s) => !marked.has(s.id)) : [];

    const reviewedAll = (rows: { submissions: { status: string }[] }, students: number) => rows.submissions.filter((s) => s.status === 'REVIEWED').length >= students;
    const sizes = new Map<string, number>();
    if (hwRows.length) {
      const g = await this.prisma.student.groupBy({ by: ['sectionId'], where: { schoolId, sectionId: { in: [...new Set(hwRows.map((h) => h.sectionId))] }, deletedAt: null }, _count: { _all: true } });
      for (const x of g) if (x.sectionId) sizes.set(x.sectionId, x._count._all);
    }
    const homeworkPending = hwRows.filter((h) => dateOnlyToIso(h.dueDate) <= today && !reviewedAll(h, h.studentIds.length || sizes.get(h.sectionId) || 0));
    const toReview = asgRows.map((a) => ({ ...a, waiting: a.submissions.filter((s) => s.status === 'SUBMITTED').length })).filter((a) => a.waiting > 0);

    const tz = school?.timezone ?? null;
    const nowMin = minutesOfDayInTimezone(tz);
    const liveLessons = lessons.filter((l) => l.kind !== 'COVERED');
    const next = liveLessons.find((l) => hmToMinutes(l.endTime) > nowMin) ?? null;

    const visibleNotices = noticeList.filter((n) => n.publishedAt).slice(0, 4);
    const approvedLeave = leaveInfo?.requests.filter((r) => r.status === 'APPROVED' && r.endDate >= today).sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[0] ?? null;

    return {
      today,
      isTeacher: !!teacherId,
      schoolDay: { working: dayStatus.working, message: dayStatus.working ? '' : describeDayOff(dayStatus) },
      metrics: {
        myClasses: scope.sectionIds.size,
        myStudents: studentCount,
        todayClasses: liveLessons.length,
        attendancePending: attendancePending.length,
        homeworkPending: homeworkPending.length,
        marksPending: papers.length,
        assignmentsToReview: toReview.reduce((n, a) => n + a.waiting, 0),
        unreadMessages,
      },
      lessons,
      nextLesson: next,
      subjects: assignments.map((a) => ({ section: { id: a.section.id, name: label(a.section) }, subject: a.subject })),
      classTeacherOf: classTeacherOf.map((s) => ({ id: s.id, name: label(s) })),
      attendancePending,
      homeworkPending: homeworkPending.slice(0, 6).map((h) => ({ id: h.id, title: h.title, section: label(h.section), subject: h.subject.name, dueDate: dateOnlyToIso(h.dueDate), overdue: dateOnlyToIso(h.dueDate) < today })),
      assignmentsToReview: toReview.slice(0, 6).map((a) => ({ id: a.id, title: a.title, section: label(a.section), subject: a.subject.name, dueDate: dateOnlyToIso(a.dueDate), waiting: a.waiting })),
      marksPending: papers.slice(0, 6).map((p) => ({ id: p.id, exam: p.exam.name, subject: p.subject.name, section: label(p.section), status: p.status, date: p.date ? dateOnlyToIso(p.date) : null })),
      upcomingExams: upcomingPapers.map((p) => ({ id: p.id, exam: p.exam.name, subject: p.subject.name, section: label(p.section), date: p.date ? dateOnlyToIso(p.date) : null, startTime: p.startTime, room: p.room })),
      notices: visibleNotices.map((n) => ({ id: n.id, title: n.title, body: n.body.slice(0, 180), createdAt: n.createdAt, isRead: n.isRead })),
      upcomingEvents: [
        ...events.map((e) => ({ id: e.id, type: e.kind, title: e.title, date: e.startDate, endDate: e.endDate, time: e.startTime })),
        ...holidays.map((h) => ({ id: h.id, type: 'HOLIDAY', title: h.name, date: dateOnlyToIso(h.startDate), endDate: dateOnlyToIso(h.endDate), time: null as string | null })),
      ].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 6),
      leave: { balances: leaveInfo?.balances ?? [], pending: leaveInfo?.requests.filter((r) => r.status === 'PENDING').length ?? 0, upcoming: approvedLeave ? { startDate: approvedLeave.startDate, endDate: approvedLeave.endDate, kind: approvedLeave.kind } : null },
      attendanceCorrections: Object.fromEntries(myCorrections.map((c) => [c.status, c._count._all])),
    };
  }

  /** Everything dated that concerns this teacher between two dates — one list for the calendar. */
  async agenda(auth: AuthContext, from: string, to: string) {
    const scope = await this.scopeService.resolveMine(auth);
    const schoolId = auth.schoolId;
    const pairs = scope.pairWhere();
    const [events, holidays, papers, coursework, leave] = await Promise.all([
      this.events.list(auth, from, to),
      this.prisma.holiday.findMany({ where: { schoolId, deletedAt: null, startDate: { lte: new Date(to) }, endDate: { gte: new Date(from) } }, orderBy: { startDate: 'asc' } }),
      this.prisma.examPaper.findMany({ where: { schoolId, exam: { deletedAt: null }, date: { gte: new Date(from), lte: new Date(to) }, ...pairs }, select: { id: true, date: true, startTime: true, room: true, exam: { select: { name: true } }, subject: { select: { name: true } }, section: { select: { name: true, class: { select: { name: true } } } } } }),
      this.prisma.coursework.findMany({ where: { schoolId, status: 'ACTIVE', dueDate: { gte: new Date(from), lte: new Date(to) }, ...pairs }, select: { id: true, kind: true, title: true, dueDate: true, subject: { select: { name: true } }, section: { select: { name: true, class: { select: { name: true } } } } } }),
      this.prisma.leaveRequest.findMany({ where: { schoolId, userId: auth.userId, status: { in: ['APPROVED', 'PENDING'] }, startDate: { lte: new Date(to) }, endDate: { gte: new Date(from) } } }),
    ]);
    const label = (s: { name: string; class: { name: string } }) => `${s.class.name} – ${s.name}`;
    const items = [
      ...holidays.map((h) => ({ type: 'HOLIDAY', title: h.name, subtitle: null as string | null, date: dateOnlyToIso(h.startDate), endDate: dateOnlyToIso(h.endDate), time: null as string | null, link: '/dashboard/calendar' })),
      ...events.map((e) => ({ type: e.kind, title: e.title, subtitle: e.location, date: e.startDate, endDate: e.endDate, time: e.startTime, link: '/dashboard/calendar' })),
      ...papers.map((p) => ({ type: 'EXAM', title: `${p.exam.name}: ${p.subject.name}`, subtitle: `${label(p.section)}${p.room ? ` · ${p.room}` : ''}`, date: dateOnlyToIso(p.date as Date), endDate: dateOnlyToIso(p.date as Date), time: p.startTime, link: '/dashboard/marks' })),
      ...coursework.map((c) => ({ type: c.kind === 'HOMEWORK' ? 'HOMEWORK_DUE' : 'ASSIGNMENT_DUE', title: c.title, subtitle: `${c.subject.name} · ${label(c.section)}`, date: dateOnlyToIso(c.dueDate), endDate: dateOnlyToIso(c.dueDate), time: null as string | null, link: c.kind === 'HOMEWORK' ? '/dashboard/homework' : '/dashboard/assignments' })),
      ...leave.map((l) => ({ type: 'LEAVE', title: `My leave (${l.status.toLowerCase()})`, subtitle: l.kind.toLowerCase(), date: dateOnlyToIso(l.startDate), endDate: dateOnlyToIso(l.endDate), time: null as string | null, link: '/dashboard/leave' })),
    ];
    return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time ?? '') < (b.time ?? '') ? -1 : 1));
  }
}
