'use client';

import Link from 'next/link';
import { Alert, Badge, Card, EmptyState, Skeleton, StatCard } from '@schovexa/ui';
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  CalendarOff,
  ClipboardCheck,
  ClipboardList,
  FilePlus2,
  GraduationCap,
  IdCard,
  Library,
  Megaphone,
  MessageSquare,
  NotebookPen,
  PartyPopper,
  PencilRuler,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTeachingDashboard, type Lesson } from '../../hooks/useTeaching';
import { useCan } from '../../hooks/useCan';
import { CountUp } from '../count-up';
import { shortDay } from './teaching-ui';

interface Action {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  tile: string;
  permission: string;
}

const ACTIONS: Action[] = [
  { href: '/dashboard/attendance', label: 'Take attendance', description: 'Mark today’s register', icon: ClipboardCheck, tile: 'from-emerald-400 to-emerald-600', permission: 'attendance.mark' },
  { href: '/dashboard/homework?new=1', label: 'Create homework', description: 'Set work for a class', icon: NotebookPen, tile: 'from-brand-electric to-brand-blue', permission: 'homework.create' },
  { href: '/dashboard/assignments?new=1', label: 'Add assignment', description: 'With a deadline and marks', icon: FilePlus2, tile: 'from-violet-500 to-fuchsia-600', permission: 'assignment.create' },
  { href: '/dashboard/marks', label: 'Enter marks', description: 'For your exam papers', icon: PencilRuler, tile: 'from-amber-400 to-orange-500', permission: 'marks.enter' },
  { href: '/dashboard/students', label: 'View students', description: 'Your classes, with notes', icon: IdCard, tile: 'from-sky-400 to-cyan-600', permission: 'student.view' },
  { href: '/dashboard/notices?new=1', label: 'Send announcement', description: 'To your class’s parents', icon: Megaphone, tile: 'from-rose-400 to-pink-600', permission: 'notice.create' },
];

function LessonRow({ lesson, next }: { lesson: Lesson; next: boolean }) {
  const covered = lesson.kind === 'COVERED';
  return (
    <li className={['flex items-center gap-4 rounded-xl border px-4 py-3', next ? 'border-brand-blue/40 bg-brand-blue/5 ring-1 ring-brand-blue/20' : 'border-slate-100 bg-slate-50/70', covered ? 'opacity-60' : ''].join(' ')}>
      <div className="w-20 shrink-0 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Period {lesson.period}</p>
        <p className="text-sm font-bold tabular-nums text-navy">{lesson.startTime}</p>
        <p className="text-xs tabular-nums text-slate-400">{lesson.endTime}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className={['truncate font-bold text-navy', covered ? 'line-through' : ''].join(' ')}>{lesson.subject.name}</p>
        <p className="truncate text-sm text-slate-500">
          {lesson.section.name}
          {lesson.room && <> · {lesson.room}</>}
        </p>
      </div>
      {next && <Badge tone="brand">Up next</Badge>}
      {lesson.kind === 'COVER' && <Badge tone="warning">Covering {lesson.otherTeacher}</Badge>}
      {covered && <Badge tone="neutral">Covered by {lesson.otherTeacher}</Badge>}
    </li>
  );
}

function TodoList<T extends { id: string }>({ title, icon, items, empty, render, href }: { title: string; icon: React.ReactNode; items: T[] | undefined; empty: string; render: (item: T) => React.ReactNode; href: string }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-navy">
          {icon} {title}
          {items && items.length > 0 && <Badge tone="warning">{items.length}</Badge>}
        </h3>
        <Link href={href} className="flex items-center gap-1 text-xs font-semibold text-brand-blue hover:underline">
          Open <ArrowRight size={12} />
        </Link>
      </div>
      {!items ? (
        <Skeleton className="mt-3 h-16 w-full" />
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id} className="py-2 text-sm first:pt-0 last:pb-0">
              {render(item)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TeacherDashboard() {
  const { can } = useCan();
  const { data, isError } = useTeachingDashboard();
  if (isError) return <Alert variant="error">We couldn’t load your dashboard. Please try again.</Alert>;

  const m = data?.metrics;
  const tile = (label: string, value: number | undefined, icon: React.ReactNode, tone: 'brand' | 'blue' | 'violet' | 'emerald' | 'amber' | 'default', hint?: string) => (
    <StatCard label={label} tone={tone} icon={icon} value={value === undefined ? <Skeleton className="h-8 w-12" /> : <CountUp value={value} />} hint={hint} />
  );

  return (
    <div>
      {data && !data.isTeacher && <Alert variant="info" className="mb-4">You don’t have a teaching profile in this school yet, so there are no classes to show. Ask the school office to add you as a teacher.</Alert>}
      {data && !data.schoolDay.working && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-900">
          <CalendarOff size={20} /> <p className="text-sm font-medium">{data.schoolDay.message || 'The school is closed today.'}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tile('My classes', m?.myClasses, <GraduationCap size={20} />, 'blue')}
        {tile('My students', m?.myStudents, <Users size={20} />, 'violet')}
        {tile('Today’s classes', m?.todayClasses, <CalendarDays size={20} />, 'brand', data?.nextLesson ? `Next: ${data.nextLesson.subject.name} at ${data.nextLesson.startTime}` : undefined)}
        {tile('Attendance pending', m?.attendancePending, <ClipboardCheck size={20} />, m && m.attendancePending > 0 ? 'amber' : 'emerald', m && m.attendancePending > 0 ? 'Register not taken' : 'All done')}
        {tile('Homework pending', m?.homeworkPending, <NotebookPen size={20} />, m && m.homeworkPending > 0 ? 'amber' : 'default', 'Past due, not reviewed')}
        {tile('Marks pending', m?.marksPending, <PencilRuler size={20} />, m && m.marksPending > 0 ? 'amber' : 'default', 'Papers still open')}
        {tile('Assignments to review', m?.assignmentsToReview, <ClipboardList size={20} />, m && m.assignmentsToReview > 0 ? 'amber' : 'default', 'Handed in, not marked')}
        {tile('Unread messages', m?.unreadMessages, <MessageSquare size={20} />, m && m.unreadMessages > 0 ? 'amber' : 'default')}
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-navy">Quick actions</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ACTIONS.filter((a) => can(a.permission)).map((a) => (
            <Link key={a.label} href={a.href}>
              <Card interactive className="group flex h-full items-center gap-4 p-5">
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-glow transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 ${a.tile}`}>
                  <a.icon size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-navy">{a.label}</span>
                  <span className="block truncate text-sm text-slate-500">{a.description}</span>
                </span>
                <ArrowRight size={18} className="text-slate-300 transition-all group-hover:translate-x-1 group-hover:text-brand-blue" />
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-navy">
              <Sparkles size={18} className="text-brand-blue" /> Today’s timetable
            </h2>
            <Link href="/dashboard/timetable" className="flex items-center gap-1 text-sm font-semibold text-brand-blue hover:underline">
              Full timetable <ArrowRight size={14} />
            </Link>
          </div>
          <div className="mt-4">
            {!data && <Skeleton className="h-40 w-full" />}
            {data && data.lessons.length === 0 && <EmptyState icon={<CalendarDays size={22} />} title="No lessons today" description={data.isTeacher ? 'Your timetable has nothing on for today.' : 'Lessons appear here once you are given a timetable.'} />}
            <ul className="flex flex-col gap-2">
              {data?.lessons.map((l) => (
                <LessonRow key={l.slotId} lesson={l} next={data.nextLesson?.slotId === l.slotId} />
              ))}
            </ul>
          </div>
          {data && data.subjects.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Your classes and subjects</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.subjects.map((s) => (
                  <Badge key={`${s.section.id}-${s.subject.id}`} tone="brand">
                    {s.subject.name} · {s.section.name}
                  </Badge>
                ))}
                {data.classTeacherOf.map((c) => (
                  <Badge key={c.id} tone="success">Class teacher · {c.name}</Badge>
                ))}
              </div>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <TodoList
            title="Register to take"
            icon={<AlertTriangle size={16} className="text-amber-500" />}
            items={data?.attendancePending}
            empty={data?.schoolDay.working === false ? 'No register today.' : 'Every register is taken.'}
            href="/dashboard/attendance"
            render={(s) => (
              <Link href={`/dashboard/attendance?sectionId=${s.id}`} className="flex items-center justify-between font-medium text-navy hover:text-brand-blue">
                {s.name} <ArrowRight size={14} />
              </Link>
            )}
          />
          <TodoList
            title="Homework to follow up"
            icon={<NotebookPen size={16} className="text-brand-blue" />}
            items={data?.homeworkPending}
            empty="Nothing waiting."
            href="/dashboard/homework?when=overdue"
            render={(h) => (
              <Link href={`/dashboard/homework/${h.id}`} className="block hover:text-brand-blue">
                <span className="font-medium text-navy">{h.title}</span>
                <span className="block text-xs text-slate-500">{h.subject} · {h.section} · due {shortDay(h.dueDate)}</span>
              </Link>
            )}
          />
          <TodoList
            title="Assignments to mark"
            icon={<ClipboardList size={16} className="text-violet-500" />}
            items={data?.assignmentsToReview}
            empty="Nothing handed in to mark."
            href="/dashboard/assignments"
            render={(a) => (
              <Link href={`/dashboard/assignments/${a.id}`} className="block hover:text-brand-blue">
                <span className="font-medium text-navy">{a.title}</span>
                <span className="block text-xs text-slate-500">{a.waiting} to review · {a.subject} · {a.section}</span>
              </Link>
            )}
          />
          <TodoList
            title="Marks still to enter"
            icon={<PencilRuler size={16} className="text-amber-500" />}
            items={data?.marksPending}
            empty="No papers waiting."
            href="/dashboard/marks"
            render={(p) => (
              <Link href={`/dashboard/marks/${p.id}`} className="block hover:text-brand-blue">
                <span className="font-medium text-navy">{p.exam} · {p.subject}</span>
                <span className="block text-xs text-slate-500">{p.section}{p.status === 'CORRECTION' ? ' · open for correction' : ''}</span>
              </Link>
            )}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <h3 className="flex items-center gap-2 text-sm font-bold text-navy"><BookOpenCheck size={16} className="text-brand-blue" /> Upcoming exams</h3>
          {data && data.upcomingExams.length === 0 && <p className="mt-3 text-sm text-slate-500">No exams in the next two weeks.</p>}
          <ul className="mt-3 divide-y divide-slate-100">
            {data?.upcomingExams.map((e) => (
              <li key={e.id} className="py-2 text-sm first:pt-0 last:pb-0">
                <span className="font-medium text-navy">{e.exam} · {e.subject}</span>
                <span className="block text-xs text-slate-500">{e.section} · {shortDay(e.date)}{e.startTime && ` · ${e.startTime}`}{e.room && ` · ${e.room}`}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-navy"><PartyPopper size={16} className="text-brand-blue" /> Upcoming events</h3>
            <Link href="/dashboard/calendar" className="text-xs font-semibold text-brand-blue hover:underline">Calendar</Link>
          </div>
          {data && data.upcomingEvents.length === 0 && <p className="mt-3 text-sm text-slate-500">Nothing scheduled in the next two weeks.</p>}
          <ul className="mt-3 divide-y divide-slate-100">
            {data?.upcomingEvents.map((e) => (
              <li key={`${e.type}-${e.id}`} className="py-2 text-sm first:pt-0 last:pb-0">
                <span className="font-medium text-navy">{e.title}</span>
                <span className="block text-xs text-slate-500">{shortDay(e.date)}{e.endDate !== e.date && ` – ${shortDay(e.endDate)}`}{e.time && ` · ${e.time}`} · {e.type === 'PARENT_TEACHER' ? 'Parent-teacher meeting' : e.type.charAt(0) + e.type.slice(1).toLowerCase()}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-navy"><Library size={16} className="text-brand-blue" /> My leave</h3>
            <Link href="/dashboard/leave" className="text-xs font-semibold text-brand-blue hover:underline">Apply</Link>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {data?.leave.balances.map((b) => (
              <li key={b.kind} className="flex items-center justify-between text-sm">
                <span className="capitalize text-slate-600">{b.kind.toLowerCase()}</span>
                <span className="font-semibold text-navy">{b.remaining} <span className="font-normal text-slate-400">of {b.allowance} left</span></span>
              </li>
            ))}
          </ul>
          {data && (data.leave.pending > 0 || data.leave.upcoming) && (
            <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
              {data.leave.pending > 0 && <>{data.leave.pending} request{data.leave.pending === 1 ? '' : 's'} waiting for a decision. </>}
              {data.leave.upcoming && <>Approved leave from {shortDay(data.leave.upcoming.startDate)}.</>}
            </p>
          )}
        </section>
      </div>

      {data && data.notices.length > 0 && (
        <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-navy"><Megaphone size={16} className="text-brand-blue" /> Notices and announcements</h3>
            <Link href="/dashboard/notices" className="flex items-center gap-1 text-xs font-semibold text-brand-blue hover:underline">All notices <ArrowRight size={12} /></Link>
          </div>
          <ul className="mt-3 divide-y divide-slate-100">
            {data.notices.map((n) => (
              <li key={n.id} className="py-2 text-sm first:pt-0 last:pb-0">
                <span className="flex items-center gap-2 font-medium text-navy">{n.title}{!n.isRead && <Badge tone="warning" dot>New</Badge>}</span>
                <span className="block truncate text-xs text-slate-500">{n.body}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
