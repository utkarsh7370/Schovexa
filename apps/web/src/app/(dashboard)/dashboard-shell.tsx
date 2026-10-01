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
  Search,
  PartyPopper,
} from 'lucide-react';
import { Avatar, LogoMark, Spinner } from '@schovexa/ui';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useCurrentSchool } from '../../hooks/useCurrentSchool';
import { useLogout } from '../../hooks/useLogout';
import { useNotices } from '../../hooks/useNotices';
import { ApiError } from '../../lib/api-client';
import { canAccessRoute } from '../../lib/access';
import { ForbiddenState } from '../../components/error-state';
import { CountryBadge } from '../../components/country-badge';
import { useEffect, useRef, useState } from 'react';

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
  { label: 'Calendar', items: [{ href: '/dashboard/holidays', label: 'Holidays', icon: PartyPopper }] },
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

// Header search: type a student's name, admission number, class or a
// parent's name/phone and land on the Students list already filtered.
// Press "/" anywhere (outside a text field) to jump into it.
function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <form
      role="search"
      className="group relative hidden w-full max-w-md md:block"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        router.push(q ? `/dashboard/students?q=${encodeURIComponent(q)}` : '/dashboard/students');
        setValue('');
        inputRef.current?.blur();
      }}
    >
      <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-brand-blue" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Search students and parents"
        placeholder="Search students, parents, classes…"
        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/80 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 transition-all duration-200 hover:border-slate-300 focus:border-brand-blue focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-blue/15"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-400 group-focus-within:hidden">/</kbd>
    </form>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: me, error: meError, isLoading: meLoading, isFetching: meFetching } = useCurrentUser();
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
    // Not signed in (or the session expired) → login. Wait for any
    // in-flight refetch first: right after a login the cache can still
    // hold the earlier 401 for a moment, and reacting to that stale
    // error would bounce a freshly signed-in user straight back out.
    if (!meFetching && meError instanceof ApiError && meError.code === 'UNAUTHORIZED') {
      router.replace('/login');
    }
  }, [meError, meFetching, router]);

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
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-50 to-sky-50">
        <LogoMark size={48} className="animate-float" />
        <Spinner size={26} />
      </div>
    );
  }

  const activeMembership = me.memberships.find((m) => m.schoolId === me.activeSchoolId);
  const roleName = activeMembership?.roleName;
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canAccessRoute(roleName, item.href)),
  })).filter((group) => group.items.length > 0);
  const forbidden = !canAccessRoute(roleName, pathname);

  const fullName = `${me.firstName} ${me.lastName}`;
  const canSearchStudents = groups.some((g) => g.items.some((i) => i.href === '/dashboard/students'));

  const sidebarContent = (
    <>
      <div className="flex items-center gap-3 px-5 py-5">
        <LogoMark size={36} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{school?.name ?? 'Schovexa'}</p>
          <p className="truncate text-[11px] font-medium text-white/50">{roleName ?? 'Workspace'}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6 pt-2 [scrollbar-color:rgba(255,255,255,0.2)_transparent] [scrollbar-width:thin]">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">{group.label}</p>
            <div className="space-y-1">
              {group.items.map((item, index) => {
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
                const Icon = item.icon;
                const isNotices = item.href === '/dashboard/notices';
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{ animationDelay: `${index * 40}ms` }}
                    aria-current={isActive ? 'page' : undefined}
                    className={[
                      'group relative flex animate-fade-in items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'bg-gradient-to-r from-brand-blue to-brand-violet text-white shadow-glow'
                        : 'text-white/70 hover:bg-white/10 hover:pl-4 hover:text-white',
                    ].join(' ')}
                  >
                    <Icon
                      size={18}
                      strokeWidth={2}
                      className={['shrink-0 transition-transform duration-200', isActive ? '' : 'group-hover:scale-110'].join(' ')}
                    />
                    {item.label}
                    {isNotices && unreadCount > 0 && (
                      <span className="relative ml-auto flex h-5 min-w-5 items-center justify-center">
                        <span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full bg-amber-400" />
                        <span className="relative inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">
                          {unreadCount}
                        </span>
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.07] p-3">
          <Avatar name={fullName} size={36} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{fullName}</p>
            <p className="truncate text-[11px] text-white/50">{me.email}</p>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col bg-brand-gradient-dark shadow-elevated lg:flex">{sidebarContent}</aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 animate-fade-in bg-navy/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside className="relative z-10 flex h-full w-72 animate-slide-in-left flex-col bg-brand-gradient-dark shadow-elevated">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
            <span className="text-sm font-semibold text-navy lg:hidden">{school?.name ?? 'Schovexa'}</span>
            <span className="hidden text-sm text-slate-500 xl:inline">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          </div>

          {canSearchStudents && <GlobalSearch />}

          <div className="flex items-center gap-3">
            <CountryBadge schoolCountry={me?.schoolCountry} />
            <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 shadow-card transition-all hover:border-brand-blue/40 hover:shadow-elevated"
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
                  className="absolute right-0 z-20 mt-2 w-60 origin-top-right animate-scale-in rounded-2xl border border-slate-200 bg-white p-1.5 shadow-elevated"
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
          </div>
        </header>

        <main className="relative flex-1 bg-gradient-to-br from-slate-50 via-white to-sky-50/60 p-4 sm:p-6 lg:p-8">
          <div className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-72 opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden="true" />
          <div key={pathname} className="relative animate-fade-in-up">
            {forbidden ? <ForbiddenState /> : children}
          </div>
        </main>
      </div>
    </div>
  );
}
