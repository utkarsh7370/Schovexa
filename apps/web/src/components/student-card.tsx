'use client';

import Link from 'next/link';
import { Avatar, Badge, Skeleton, type BadgeTone } from '@schovexa/ui';
import { ArrowUpRight, Cake, GraduationCap, School } from 'lucide-react';
import type { StudentListItem } from '../hooks/useStudents';
import { SCHOOL_DAY_STYLE, isHalfDay } from '../lib/school-day';
import { SchoolDayBadge } from './school-day-badge';

export const STUDENT_STATUS_LABELS: Record<string, string> = {
  ENROLLED: 'Enrolled',
  TRANSFERRED: 'Transferred',
  GRADUATED: 'Graduated',
  WITHDRAWN: 'Withdrawn',
};

export const STUDENT_STATUS_TONES: Record<string, BadgeTone> = {
  ENROLLED: 'success',
  TRANSFERRED: 'info',
  GRADUATED: 'brand',
  WITHDRAWN: 'neutral',
};

// A thin colored bar on the card's top edge: status at a glance, before
// reading the badge.
const STATUS_BAR: Record<string, string> = {
  ENROLLED: 'from-emerald-400 to-teal-500',
  TRANSFERRED: 'from-sky-400 to-blue-500',
  GRADUATED: 'from-brand-blue to-brand-violet',
  WITHDRAWN: 'from-slate-300 to-slate-400',
};

export function ageFromDob(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const beforeBirthday = now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

export function StudentCard({ student, index = 0 }: { student: StudentListItem; index?: number }) {
  const fullName = `${student.firstName} ${student.lastName}`;
  const age = ageFromDob(student.dateOfBirth);
  const teacher = student.section?.classTeacher;
  const teacherName = teacher ? `${teacher.user.firstName} ${teacher.user.lastName}` : null;

  return (
    <Link
      href={`/dashboard/students/${student.id}`}
      className="group relative block animate-fade-in-up rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
      style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
    >
      <article className="relative h-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card transition-all duration-300 group-hover:-translate-y-1 group-hover:border-brand-blue/30 group-hover:shadow-elevated">
        <div className={['h-1.5 bg-gradient-to-r', isHalfDay(student.schoolDay) ? SCHOOL_DAY_STYLE[student.schoolDay].bar : STATUS_BAR[student.status] ?? STATUS_BAR.WITHDRAWN].join(' ')} />
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-gradient-soft opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />

        <div className="relative p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3.5">
              <Avatar name={fullName} tone="auto" size={52} className="shadow-card transition-transform duration-300 group-hover:scale-105" />
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-navy">{fullName}</p>
                <p className="mt-0.5 inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
                  {student.admissionNo}
                </p>
              </div>
            </div>
            <Badge tone={STUDENT_STATUS_TONES[student.status] ?? 'neutral'} dot>
              {STUDENT_STATUS_LABELS[student.status] ?? student.status}
            </Badge>
          </div>

          <dl className="mt-5 space-y-2.5 text-sm">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-brand-blue">
                <School size={15} />
              </span>
              <dt className="sr-only">Class</dt>
              <dd className="truncate font-medium text-slate-700">
                {student.section ? `${student.section.class.name} · Section ${student.section.name}` : <span className="text-slate-400">Not assigned to a class</span>}
              </dd>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-brand-violet">
                <GraduationCap size={15} />
              </span>
              <dt className="sr-only">Class teacher</dt>
              <dd className="truncate text-slate-600">
                {teacherName ?? <span className="text-slate-400">No class teacher</span>}
              </dd>
            </div>
          </dl>

          <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3.5">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <SchoolDayBadge value={student.schoolDay} />
              {student.gender && <span className="rounded-full bg-slate-100 px-2 py-0.5 capitalize">{student.gender.toLowerCase()}</span>}
              {age !== null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">
                  <Cake size={12} /> {age} yrs
                </span>
              )}
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue opacity-70 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100">
              View profile <ArrowUpRight size={14} />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

export function StudentCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card" aria-hidden="true">
      <div className="h-1.5 animate-pulse bg-slate-200/70" />
      <div className="p-5">
        <div className="flex items-center gap-3.5">
          <Skeleton className="h-[52px] w-[52px] shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
        <div className="mt-5 space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="mt-6 h-4 w-1/3" />
      </div>
    </div>
  );
}
