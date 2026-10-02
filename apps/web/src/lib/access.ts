// Which dashboard routes each role may open. This is the UI half of
// authorization — it decides what the sidebar shows and which screens
// render a 403 page — while every API route still enforces its own
// permission server-side regardless (docs/authorization.md). An
// unrecognized role name (a school-customized role) falls through to
// "everything except the role-specific pages below".
const ROLE_ROUTES: Record<string, string[]> = {
  Teacher: [
    '/dashboard',
    '/dashboard/students',
    '/dashboard/classes',
    '/dashboard/subjects',
    '/dashboard/departments',
    '/dashboard/groups',
    '/dashboard/attendance',
    '/dashboard/holidays',
    '/dashboard/calendar',
    '/dashboard/notices',
    '/dashboard/my-attendance',
    '/dashboard/profile',
  ],
  Accountant: ['/dashboard', '/dashboard/students', '/dashboard/fees', '/dashboard/holidays', '/dashboard/calendar', '/dashboard/notices', '/dashboard/my-attendance', '/dashboard/profile'],
  Receptionist: ['/dashboard', '/dashboard/students', '/dashboard/parents', '/dashboard/holidays', '/dashboard/calendar', '/dashboard/notices', '/dashboard/my-attendance', '/dashboard/profile'],
  Parent: ['/dashboard', '/dashboard/my-children', '/dashboard/holidays', '/dashboard/calendar', '/dashboard/notices', '/dashboard/profile'],
};

// Pages that only make sense for one role. "My Children" lists the
// students linked to the signed-in *parent*, so showing it to a
// Director or Teacher just gives them an empty page.
const ROLE_ONLY_ROUTES: Record<string, string[]> = {
  '/dashboard/my-children': ['Parent'],
};

function matches(pathname: string, route: string): boolean {
  // "/dashboard" is the home screen — matching it as a prefix would
  // unlock every page under it.
  return route === '/dashboard' ? pathname === route : pathname === route || pathname.startsWith(`${route}/`);
}

export function canAccessRoute(roleName: string | undefined, pathname: string): boolean {
  const restricted = Object.entries(ROLE_ONLY_ROUTES).find(([route]) => matches(pathname, route));
  if (restricted) return !!roleName && restricted[1].includes(roleName);

  const allowed = roleName ? ROLE_ROUTES[roleName] : undefined;
  if (!allowed) return true;
  return allowed.some((route) => matches(pathname, route));
}
