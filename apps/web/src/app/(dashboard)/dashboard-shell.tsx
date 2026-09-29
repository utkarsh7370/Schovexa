'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Users,
  CalendarDays,
  LogOut,
  School,
  BookOpen,
  GraduationCap,
  IdCard,
  UserRound,
  ClipboardCheck,
  Wallet,
  Bell,
  Heart,
  Menu,
  X,
  ChevronDown,
  BarChart3,
} from 'lucide-react';
import { Avatar, LogoMark, Spinner } from '@schovexa/ui';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useCurrentSchool } from '../../hooks/useCurrentSchool';
import { useLogout } from '../../hooks/useLogout';
import { useNotices } from '../../hooks/useNotices';
import { ApiError } from '../../lib/api-client';
import { useEffect, useState } from 'react';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Grouped so the sidebar reads as "areas of school life" (docs/
// frontend-architecture.md §5's human-language navigation), not a flat
// list of 14 unrelated links.
const NAV_GROUPS: NavGroup[] = [
  { label: 'Overview', items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    label: 'People',
    items: [
      { href: '/dashboard/students', label: 'Students', icon: IdCard },
      { href: '/dashboard/parents', label: 'Parents', icon: UserRound },
      { href: '/dashboard/my-children', label: 'My Children', icon: Heart },
      { href: '/dashboard/teachers', label: 'Teachers', icon: GraduationCap },
      { href: '/dashboard/staff', label: 'Staff', icon: Users },
    ],
  },
  {
    label: 'Teaching',
    items: [
      { href: '/dashboard/academic-years', label: 'Academic Years', icon: CalendarDays },
      { href: '/dashboard/classes', label: 'Classes', icon: School },
      { href: '/dashboard/subjects', label: 'Subjects', icon: BookOpen },
      { href: '/dashboard/attendance', label: 'Attendance', icon: ClipboardCheck },
    ],
  },
  { label: 'Money', items: [{ href: '/dashboard/fees', label: 'Fees', icon: Wallet }] },
  { label: 'Insights', items: [{ href: '/dashboard/reports', label: 'Reports', icon: BarChart3 }] },
  { label: 'Communication', items: [{ href: '/dashboard/notices', label: 'Notices', icon: Bell }] },
  {
    label: 'Administration',
    items: [
      { href: '/dashboard/roles', label: 'Roles', icon: ShieldCheck },
      { href: '/dashboard/settings', label: 'School Settings', icon: Settings },
    ],
  },
];

// Which routes each default-seeded role actually has a reason to open,
// so the sidebar shows a Teacher "their" school instead of every module
// they'll only ever get a 403 from. This is a display convenience only —
// an unrecognized role name (a school-customized role) falls through to
// "show everything," and every route still enforces its own permission
// server-side regardless of what this map says (docs/authorization.md).
const ROLE_VISIBLE_ROUTES: Record<string, Set<string>> = {
  Teacher: new Set([
    '/dashboard',
    '/dashboard/students',
    '/dashboard/classes',
    '/dashboard/subjects',
    '/dashboard/attendance',
    '/dashboard/notices',
  ]),
  Accountant: new Set(['/dashboard', '/dashboard/students', '/dashboard/fees', '/dashboard/notices']),
  Receptionist: new Set(['/dashboard', '/dashboard/students', '/dashboard/parents', '/dashboard/notices']),
  Parent: new Set(['/dashboard', '/dashboard/my-children', '/dashboard/notices']),
};

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: me, error: meError, isLoading: meLoading } = useCurrentUser();
  const { data: school } = useCurrentSchool();
  const { data: notices } = useNotices();
  const logout = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const unreadCount = notices?.filter((n) => n.publishedAt && !n.isRead).length ?? 0;

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (meError instanceof ApiError && meError.code === 'UNAUTHORIZED') {
      router.push('/login');
    }
  }, [meError, router]);

  useEffect(() => {
    // No active school selected on this session — send them to pick
    // one. Checked via /auth/me's activeSchoolId (readable by every
    // authenticated role, no permission gate) rather than /schools/me's
    // error code: that endpoint additionally requires school.view, so a
    // role without it — Teacher, Parent, Receptionist — 403s there even
    // with an active school correctly selected.
    if (me && me.activeSchoolId === null) {
      router.push('/select-school');
    }
  }, [me, router]);

  if (meLoading || !me || me.activeSchoolId === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Spinner size={28} />
      </div>
    );
  }

  const activeMembership = me.memberships.find((m) => m.schoolId === me.activeSchoolId);
  const roleName = activeMembership?.roleName;
  const visibleRoutes = roleName ? ROLE_VISIBLE_ROUTES[roleName] : undefined;
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !visibleRoutes || visibleRoutes.has(item.href)),
  })).filter((group) => group.items.length > 0);

  const fullName = `${me.firstName} ${me.lastName}`;

  const sidebarContent = (
    <>
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-5">
        <LogoMark size={32} />
        <span className="truncate text-sm font-semibold text-navy">{school?.name ?? 'Schovexa'}</span>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto p-3">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
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
                    {item.href === '/dashboard/notices' && unreadCount > 0 && (
                      <span className="ml-auto rounded-full bg-brand-blue px-2 py-0.5 text-xs font-semibold text-white">
                        {unreadCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">{sidebarContent}</aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-navy/40" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside className="relative z-10 flex h-full w-72 flex-col bg-white shadow-elevated">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
            <span className="text-sm font-medium text-slate-500 lg:hidden">{school?.name ?? 'Schovexa'}</span>
          </div>

          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <Avatar name={fullName} size={32} />
              <span className="hidden text-sm font-medium text-navy sm:inline">{me.firstName}</span>
              <ChevronDown size={16} className="hidden text-slate-400 sm:inline" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-elevated"
                >
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-semibold text-navy">{fullName}</p>
                    <p className="truncate text-xs text-slate-500">{me.email}</p>
                    {roleName && (
                      <p className="mt-1 inline-block rounded-full bg-brand-blue/10 px-2 py-0.5 text-xs font-medium text-brand-blue">
                        {roleName}
                      </p>
                    )}
                  </div>
                  <div className="my-1 h-px bg-slate-100" />
                  <button
                    role="menuitem"
                    onClick={logout}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-100"
                  >
                    <LogOut size={16} />
                    Log out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
