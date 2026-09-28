'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Settings, ShieldCheck, Users, CalendarDays, LogOut, School, BookOpen, GraduationCap, IdCard, UserRound, ClipboardCheck, Wallet } from 'lucide-react';
import { LogoMark, Spinner } from '@schovexa/ui';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useCurrentSchool } from '../../hooks/useCurrentSchool';
import { useLogout } from '../../hooks/useLogout';
import { ApiError } from '../../lib/api-client';
import { useEffect } from 'react';

// Nav items are shown to any authenticated, school-scoped user — there
// is no "get my resolved permissions" endpoint yet to gate them
// individually (docs/frontend-architecture.md §5's permission-driven nav
// is a later refinement, not built here). This is only a UX convenience
// either way: every route these link to independently enforces its own
// permission server-side (docs/authorization.md) — a visible-but-403
// nav item is a display polish issue, not a security gap.
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/settings', label: 'School Settings', icon: Settings },
  { href: '/dashboard/roles', label: 'Roles', icon: ShieldCheck },
  { href: '/dashboard/staff', label: 'Staff', icon: Users },
  { href: '/dashboard/academic-years', label: 'Academic Years', icon: CalendarDays },
  { href: '/dashboard/classes', label: 'Classes', icon: School },
  { href: '/dashboard/subjects', label: 'Subjects', icon: BookOpen },
  { href: '/dashboard/teachers', label: 'Teachers', icon: GraduationCap },
  { href: '/dashboard/students', label: 'Students', icon: IdCard },
  { href: '/dashboard/parents', label: 'Parents', icon: UserRound },
  { href: '/dashboard/attendance', label: 'Attendance', icon: ClipboardCheck },
  { href: '/dashboard/fees', label: 'Fees', icon: Wallet },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: me, error: meError, isLoading: meLoading } = useCurrentUser();
  const { data: school, error: schoolError, isLoading: schoolLoading } = useCurrentSchool();
  const logout = useLogout();

  useEffect(() => {
    if (meError instanceof ApiError && meError.code === 'UNAUTHORIZED') {
      router.push('/login');
    }
  }, [meError, router]);

  useEffect(() => {
    // No active school selected on this session — send them to pick one
    // rather than showing a broken dashboard (SchoolContextGuard denies
    // every school-scoped call until a school is selected).
    if (schoolError instanceof ApiError && schoolError.code === 'FORBIDDEN') {
      router.push('/select-school');
    }
  }, [schoolError, router]);

  if (meLoading || schoolLoading || !me || !school) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-5">
          <LogoMark size={32} />
          <span className="truncate text-sm font-semibold text-navy">{school.name}</span>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-blue/10 text-brand-blue' : 'text-slate-600 hover:bg-slate-100',
                ].join(' ')}
              >
                <Icon size={18} strokeWidth={2} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="mb-2 px-3">
            <p className="truncate text-sm font-medium text-navy">
              {me.firstName} {me.lastName}
            </p>
            <p className="truncate text-xs text-slate-500">{me.email}</p>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <LogOut size={18} strokeWidth={2} />
            Log out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-slate-50 p-8">{children}</main>
    </div>
  );
}
