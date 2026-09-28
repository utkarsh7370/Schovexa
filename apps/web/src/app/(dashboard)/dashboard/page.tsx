'use client';

import Link from 'next/link';
import { Button, Card, StatCard, Skeleton, Badge } from '@schovexa/ui';
import { Users, IdCard, Wallet, Bell, UserPlus, ClipboardCheck, UserRound, FilePlus2 } from 'lucide-react';
import { useCurrentUser } from '../../../hooks/useCurrentUser';
import { useCurrentSchool } from '../../../hooks/useCurrentSchool';
import { useStudents } from '../../../hooks/useStudents';
import { useMemberships } from '../../../hooks/useMemberships';
import { useOutstandingFees } from '../../../hooks/useFees';
import { useNotices } from '../../../hooks/useNotices';
import { formatMinor } from '../../../lib/currency';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardHomePage() {
  const { data: me } = useCurrentUser();
  const { data: school } = useCurrentSchool();
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

  const { data: students } = useStudents();
  const { data: memberships } = useMemberships({ enabled: showStaffStat });
  const { data: outstanding } = useOutstandingFees({ enabled: showFeeStat });
  const { data: notices } = useNotices();

  const activeStaffCount = memberships?.filter((m) => m.status === 'ACTIVE').length;
  const outstandingTotalMinor = outstanding?.reduce((sum, row) => sum + row.balanceMinor, 0) ?? 0;
  const unreadNotices = notices?.filter((n) => n.publishedAt && !n.isRead) ?? [];
  const recentNotices = (notices ?? []).filter((n) => n.publishedAt).slice(0, 3);

  const firstName = me?.firstName ?? '';

  if (showParentView) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-navy">
          {greeting()}, {firstName}.
        </h1>
        <p className="mt-1 text-slate-500">Here&apos;s a quick look at your family&apos;s school account.</p>

        <Card className="mt-6 flex items-center justify-between p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue">
              <UserRound size={22} />
            </div>
            <div>
              <p className="font-semibold text-navy">Attendance, fees, and updates</p>
              <p className="text-sm text-slate-500">See your children&apos;s status in one place.</p>
            </div>
          </div>
          <Link href="/dashboard/my-children">
            <Button size="sm">Open</Button>
          </Link>
        </Card>

        {unreadNotices.length > 0 && (
          <Card className="mt-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-navy">New notices</h2>
              <Badge tone="brand">{unreadNotices.length} unread</Badge>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {unreadNotices.slice(0, 3).map((notice) => (
                <div key={notice.id}>
                  <p className="text-sm font-medium text-navy">{notice.title}</p>
                  <p className="text-sm text-slate-500">{notice.body}</p>
                </div>
              ))}
            </div>
            <Link href="/dashboard/notices" className="mt-4 inline-block text-sm font-medium text-brand-blue hover:underline">
              View all notices →
            </Link>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight text-navy">
        {greeting()}, {firstName}.
      </h1>
      <p className="mt-1 text-slate-500">
        {school ? <>Here&apos;s what&apos;s happening at {school.name}.</> : <>Here&apos;s your overview.</>}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(showPeopleStats || showTeacherView) && (
          <StatCard
            label={showTeacherView ? 'My students' : 'Students'}
            value={students ? students.length : <Skeleton className="h-7 w-12" />}
            icon={<IdCard size={18} />}
          />
        )}
        {showStaffStat && (
          <StatCard
            label="Staff"
            value={activeStaffCount ?? <Skeleton className="h-7 w-12" />}
            icon={<Users size={18} />}
          />
        )}
        {showFeeStat && (
          <StatCard
            label="Fees outstanding"
            value={outstanding ? formatMinor(outstandingTotalMinor) : <Skeleton className="h-7 w-20 bg-white/30" />}
            icon={<Wallet size={18} />}
            tone="brand"
            hint={outstanding ? `${outstanding.length} payment${outstanding.length === 1 ? '' : 's'} due` : undefined}
          />
        )}
        <StatCard
          label="Notices"
          value={notices ? unreadNotices.length : <Skeleton className="h-7 w-12" />}
          icon={<Bell size={18} />}
          hint="Unread"
        />
      </div>

      {(showPeopleStats || showFeeStat) && (outstanding?.length ?? 0) > 0 && (
        <Card className="mt-6 p-6">
          <h2 className="text-base font-semibold text-navy">Needs attention</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-slate-600">
            {(outstanding?.length ?? 0) > 0 && (
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                {outstanding?.length} fee payment{outstanding?.length === 1 ? '' : 's'} still outstanding
              </li>
            )}
          </ul>
        </Card>
      )}

      <Card className="mt-6 p-6">
        <h2 className="text-base font-semibold text-navy">Quick actions</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {showPeopleStats && !showTeacherView && (
            <Link href="/dashboard/students">
              <Button size="sm" variant="secondary">
                <UserPlus size={16} /> Add student
              </Button>
            </Link>
          )}
          {showStaffStat && (
            <Link href="/dashboard/staff">
              <Button size="sm" variant="secondary">
                <UserPlus size={16} /> Invite staff
              </Button>
            </Link>
          )}
          {showTeacherView && (
            <Link href="/dashboard/attendance">
              <Button size="sm" variant="secondary">
                <ClipboardCheck size={16} /> Mark attendance
              </Button>
            </Link>
          )}
          {showFeeStat && (
            <Link href="/dashboard/fees">
              <Button size="sm" variant="secondary">
                <Wallet size={16} /> Collect a fee
              </Button>
            </Link>
          )}
          {roleName === 'Receptionist' && (
            <Link href="/dashboard/parents">
              <Button size="sm" variant="secondary">
                <UserRound size={16} /> Add parent
              </Button>
            </Link>
          )}
          <Link href="/dashboard/notices">
            <Button size="sm" variant="secondary">
              <FilePlus2 size={16} /> Create notice
            </Button>
          </Link>
        </div>
      </Card>

      {recentNotices.length > 0 && (
        <Card className="mt-6 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-navy">Recent notices</h2>
            <Link href="/dashboard/notices" className="text-sm font-medium text-brand-blue hover:underline">
              View all
            </Link>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {recentNotices.map((notice) => (
              <div key={notice.id} className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-navy">{notice.title}</p>
                  <p className="text-sm text-slate-500">{notice.body}</p>
                </div>
                {notice.publishedAt && !notice.isRead && <Badge tone="brand">New</Badge>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
