'use client';

import Link from 'next/link';
import { Badge, Button, Card, Skeleton, StatCard, EmptyState } from '@schovexa/ui';
import {
  ArrowRight,
  Bell,
  BellRing,
  CheckCircle2,
  ClipboardCheck,
  FilePlus2,
  IdCard,
  Sparkles,
  UserPlus,
  UserRound,
  Users,
  Wallet,
  AlertTriangle,
  Megaphone,
  BarChart3,
  type LucideIcon,
} from 'lucide-react';
import { useCurrentUser } from '../../../hooks/useCurrentUser';
import { useCurrentSchool } from '../../../hooks/useCurrentSchool';
import { useStudents } from '../../../hooks/useStudents';
import { useMemberships } from '../../../hooks/useMemberships';
import { useOutstandingFees } from '../../../hooks/useFees';
import { useNotices } from '../../../hooks/useNotices';
import { formatMinor } from '../../../lib/currency';
import { CountUp } from '../../../components/count-up';
import { NoticeCard, useNoticeViewer } from '../../../components/notice-card';
import { NextHolidayCard } from '../../../components/next-holiday';
import { AcademicYearAttention } from '../../../components/academic-year-attention';
import { StaffAttendanceAttention } from '../../../components/staff-attendance-attention';
import { PunchCard } from '../../../components/punch-card';
import { FinanceDashboard } from '../../../components/finance/finance-dashboard';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

interface QuickAction {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  tile: string;
}

export default function DashboardHomePage() {
  const { data: me } = useCurrentUser();
  const { data: school } = useCurrentSchool();
  const viewer = useNoticeViewer();
  const activeMembership = me?.memberships.find((m) => m.schoolId === me?.activeSchoolId);
  const roleName = activeMembership?.roleName;

  // Each role only sees the numbers it's meaningfully able to act on —
  // both to avoid a 403 for a role this data isn't granted to, and so a
  // Teacher isn't shown a school-wide fee total that isn't theirs to
  // manage. An unrecognized (school-customized) role name gets the
  // quiet, safe default rather than guessing at what it can see.
  const showPeopleStats = roleName === 'Director' || roleName === 'Receptionist' || roleName === undefined;
  const showStaffStat = roleName === 'Director';
  const showFeeStat = roleName === 'Director' || roleName === 'Accountant';
  const showTeacherView = roleName === 'Teacher';
  const showParentView = roleName === 'Parent';

  const { data: students } = useStudents({ enabled: roleName !== 'Accountant' });
  const { data: memberships } = useMemberships({ enabled: showStaffStat });
  const { data: outstanding } = useOutstandingFees({ enabled: showFeeStat && roleName !== 'Accountant' });
  const { data: notices } = useNotices();

  const activeStaffCount = memberships?.filter((m) => m.status === 'ACTIVE').length;
  const outstandingTotalMinor = outstanding?.reduce((sum, row) => sum + row.balanceMinor, 0) ?? 0;
  const publishedNotices = (notices ?? []).filter((n) => n.publishedAt);
  const unreadNotices = publishedNotices.filter((n) => !n.isRead);
  const recentNotices = publishedNotices.slice(0, 3);

  const firstName = me?.firstName ?? '';
  // The school's own calendar day, not this browser's — they differ across time zones.
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: school?.timezone });

  const hero = (
    <div className="relative overflow-hidden rounded-3xl bg-brand-gradient-dark p-7 text-white shadow-elevated sm:p-9">
      <div className="bg-grid-light pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-10 -top-16 h-64 w-64 animate-blob rounded-full bg-brand-electric/35 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 h-64 w-64 animate-blob rounded-full bg-brand-violet/45 blur-3xl [animation-delay:-5s]" aria-hidden="true" />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/70">
            <Sparkles size={14} /> {today}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            {greeting()}, {firstName || 'there'}!
          </h1>
          <p className="mt-2 max-w-xl text-white/75">
            {school ? <>Here&apos;s what&apos;s happening at {school.name} today.</> : <>Here&apos;s your overview for today.</>}
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
        <NextHolidayCard />
        {unreadNotices.length > 0 && (
          <Link
            href="/dashboard/notices"
            className="group flex w-fit items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-inset ring-white/25 backdrop-blur transition-all hover:bg-white/20"
          >
            <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-navy">
              <BellRing size={20} className="origin-top animate-wiggle" />
              <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5">
                <span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full bg-amber-300" />
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-amber-400 ring-2 ring-navy" />
              </span>
            </span>
            <span>
              <span className="block text-sm font-bold">
                {unreadNotices.length} unread notice{unreadNotices.length === 1 ? '' : 's'}
              </span>
              <span className="block text-xs text-white/70">Tap to read</span>
            </span>
            <ArrowRight size={16} className="ml-1 transition-transform group-hover:translate-x-1" />
          </Link>
        )}
        </div>
      </div>
    </div>
  );

  const noticesSection = (title: string, list: typeof recentNotices) => (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-navy">
          <Megaphone size={18} className="text-brand-blue" /> {title}
        </h2>
        <Link href="/dashboard/notices" className="flex items-center gap-1 text-sm font-semibold text-brand-blue hover:underline">
          View all <ArrowRight size={14} />
        </Link>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {list.length === 0 ? (
          <EmptyState icon={<Bell size={22} />} title="No notices yet" description="Announcements from your school will appear here." />
        ) : (
          list.map((notice, i) => <NoticeCard key={notice.id} notice={notice} onOpen={viewer.open} index={i} />)
        )}
      </div>
    </section>
  );

  if (showParentView) {
    return (
      <div className="mx-auto max-w-4xl">
        {hero}
        <Link href="/dashboard/my-children" className="group mt-6 block">
          <Card interactive className="flex items-center justify-between p-6">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-electric to-brand-blue text-white shadow-glow">
                <UserRound size={22} />
              </span>
              <div>
                <p className="font-bold text-navy">Attendance, fees and updates</p>
                <p className="text-sm text-slate-500">See your children&apos;s status in one place.</p>
              </div>
            </div>
            <ArrowRight size={20} className="text-slate-300 transition-all group-hover:translate-x-1 group-hover:text-brand-blue" />
          </Card>
        </Link>
        {noticesSection(unreadNotices.length > 0 ? 'New notices' : 'Recent notices', unreadNotices.length > 0 ? unreadNotices.slice(0, 3) : recentNotices)}
        {viewer.dialog}
      </div>
    );
  }

  if (roleName === 'Accountant') {
    return (
      <div className="mx-auto max-w-6xl">
        {hero}
        <PunchCard compact className="mt-6" />
        <div className="mt-6">
          <FinanceDashboard />
        </div>
        {noticesSection('Recent notices', recentNotices)}
        {viewer.dialog}
      </div>
    );
  }

  const stats: { key: string; node: React.ReactNode }[] = [];
  if (showPeopleStats || showTeacherView) {
    stats.push({
      key: 'students',
      node: (
        <StatCard
          label={showTeacherView ? 'My students' : 'Students'}
          value={students ? <CountUp value={students.length} /> : <Skeleton className="h-8 w-14" />}
          icon={<IdCard size={20} />}
          tone="blue"
        />
      ),
    });
  }
  if (showStaffStat) {
    stats.push({
      key: 'staff',
      node: (
        <StatCard
          label="Active staff"
          value={activeStaffCount !== undefined ? <CountUp value={activeStaffCount} /> : <Skeleton className="h-8 w-14" />}
          icon={<Users size={20} />}
          tone="violet"
        />
      ),
    });
  }
  if (showFeeStat) {
    stats.push({
      key: 'fees',
      node: (
        <StatCard
          label="Fees outstanding"
          value={
            outstanding ? (
              <CountUp value={outstandingTotalMinor} format={(n) => formatMinor(Math.round(n))} />
            ) : (
              <Skeleton className="h-8 w-24 bg-white/30" />
            )
          }
          icon={<Wallet size={20} />}
          tone="brand"
          hint={outstanding ? `${outstanding.length} payment${outstanding.length === 1 ? '' : 's'} due` : undefined}
        />
      ),
    });
  }
  stats.push({
    key: 'notices',
    node: (
      <StatCard
        label="Unread notices"
        value={notices ? <CountUp value={unreadNotices.length} /> : <Skeleton className="h-8 w-14" />}
        icon={<Bell size={20} />}
        tone={unreadNotices.length > 0 ? 'amber' : 'emerald'}
        hint={notices ? (unreadNotices.length > 0 ? 'Waiting for you' : 'All caught up') : undefined}
      />
    ),
  });

  // "Needs attention" — every item is something the viewer can act on,
  // with a direct link to do it. Highlighted (amber, pulsing) whenever
  // there is anything to do; a calm "all caught up" card otherwise.
  const attention: { key: string; text: string; href: string; cta: string }[] = [];
  if (showFeeStat && (outstanding?.length ?? 0) > 0) {
    attention.push({
      key: 'fees',
      text: `${outstanding?.length} fee payment${outstanding?.length === 1 ? '' : 's'} still outstanding (${formatMinor(outstandingTotalMinor)})`,
      href: '/dashboard/fees',
      cta: 'Review fees',
    });
  }
  if (unreadNotices.length > 0) {
    attention.push({
      key: 'notices',
      text: `${unreadNotices.length} unread notice${unreadNotices.length === 1 ? '' : 's'} from your school`,
      href: '/dashboard/notices',
      cta: 'Read now',
    });
  }
  const dataReady = notices !== undefined && (!showFeeStat || outstanding !== undefined);

  const actions: QuickAction[] = [];
  if (showPeopleStats && !showTeacherView) {
    actions.push({ href: '/dashboard/students', label: 'Add student', description: 'Admit a new student', icon: UserPlus, tile: 'from-brand-electric to-brand-blue' });
  }
  if (showStaffStat) {
    actions.push({ href: '/dashboard/staff', label: 'Invite staff', description: 'Add a team member', icon: Users, tile: 'from-brand-blue to-brand-violet' });
  }
  if (showTeacherView) {
    actions.push({ href: '/dashboard/attendance', label: 'Mark attendance', description: 'Take today\'s register', icon: ClipboardCheck, tile: 'from-emerald-400 to-emerald-600' });
  }
  if (showFeeStat) {
    actions.push({ href: '/dashboard/fees', label: 'Collect a fee', description: 'Record a payment', icon: Wallet, tile: 'from-amber-400 to-orange-500' });
  }
  if (roleName === 'Receptionist') {
    actions.push({ href: '/dashboard/parents', label: 'Add parent', description: 'Register a guardian', icon: UserRound, tile: 'from-emerald-400 to-emerald-600' });
  }
  if (roleName === 'Director') {
    actions.push({ href: '/dashboard/reports', label: 'View reports', description: 'Students, attendance, fees', icon: BarChart3, tile: 'from-sky-400 to-cyan-600' });
  }
  actions.push({ href: '/dashboard/notices', label: 'Create notice', description: 'Announce to your school', icon: FilePlus2, tile: 'from-violet-500 to-fuchsia-600' });

  return (
    <div className="mx-auto max-w-6xl">
      {hero}
      <PunchCard compact className="mt-6" />
      <AcademicYearAttention />
      <StaffAttendanceAttention />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <div key={s.key} className="animate-fade-in-up" style={{ animationDelay: `${i * 90}ms` }}>
            {s.node}
          </div>
        ))}
      </div>

      {dataReady && (
        <section className="mt-6 animate-fade-in-up" style={{ animationDelay: '250ms' }}>
          {attention.length > 0 ? (
            <div className="relative animate-glow-pulse overflow-hidden rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 p-6 shadow-card">
              <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-amber-400 to-orange-500" aria-hidden="true" />
              <div className="flex items-start gap-4">
                <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-[0_10px_24px_-8px_rgba(245,158,11,0.7)]">
                  <AlertTriangle size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-amber-950">
                    Needs your attention
                    <Badge tone="warning" pulse>
                      {attention.length}
                    </Badge>
                  </h2>
                  <ul className="mt-3 divide-y divide-amber-200/70">
                    {attention.map((item) => (
                      <li key={item.key} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                        <span className="flex items-start gap-2 text-sm font-medium text-amber-900">
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                          {item.text}
                        </span>
                        <Link href={item.href}>
                          <Button size="sm" variant="secondary">
                            {item.cta} <ArrowRight size={14} />
                          </Button>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white">
                <CheckCircle2 size={22} />
              </span>
              <div>
                <p className="font-bold text-emerald-900">You&apos;re all caught up</p>
                <p className="text-sm text-emerald-800/70">Nothing needs your attention right now.</p>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-bold text-navy">Quick actions</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map((a, i) => (
            <Link key={a.href + a.label} href={a.href} className="animate-fade-in-up" style={{ animationDelay: `${300 + i * 70}ms` }}>
              <Card interactive className="group flex h-full items-center gap-4 p-5">
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-glow transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 ${a.tile}`}>
                  <a.icon size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-navy">{a.label}</span>
                  <span className="block truncate text-sm text-slate-500">{a.description}</span>
                </span>
                <ArrowRight size={18} className="text-slate-300 transition-all duration-300 group-hover:translate-x-1 group-hover:text-brand-blue" />
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {noticesSection('Recent notices', recentNotices)}
      {viewer.dialog}
    </div>
  );
}
