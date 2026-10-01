'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Dialog, EmptyState, PageHeader, SearchInput, SelectField, Skeleton, StatCard, TextField, useToast } from '@schovexa/ui';
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  FileText,
  GraduationCap,
  IdCard,
  KeyRound,
  Lock,
  PartyPopper,
  Pencil,
  Plus,
  School,
  ScrollText,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useRoles, usePermissionCatalog, ROLES_QUERY_KEY, type Permission, type Role } from '../../../../hooks/useRoles';
import { CURRENT_USER_QUERY_KEY } from '../../../../hooks/useCurrentUser';
import { useCan } from '../../../../hooks/useCan';
import { api, ApiError } from '../../../../lib/api-client';

// School modules a permission's `module` field maps to, in plain language,
// each with its own icon so a long permission list scans by area.
const MODULES: Record<string, { label: string; icon: LucideIcon }> = {
  student: { label: 'Students', icon: IdCard },
  parent: { label: 'Parents', icon: UserRound },
  teacher: { label: 'Teachers', icon: GraduationCap },
  class: { label: 'Classes', icon: School },
  subject: { label: 'Subjects', icon: BookOpen },
  attendance: { label: 'Attendance', icon: ClipboardCheck },
  fee: { label: 'Fees', icon: Wallet },
  notice: { label: 'Notices', icon: Bell },
  holiday: { label: 'Holidays', icon: PartyPopper },
  report: { label: 'Reports', icon: BarChart3 },
  user: { label: 'Staff & invitations', icon: Users },
  role: { label: 'Roles', icon: ShieldCheck },
  school: { label: 'School settings', icon: Settings },
  academicYear: { label: 'Academic years', icon: CalendarDays },
  document: { label: 'Documents', icon: FileText },
  audit: { label: 'Audit log', icon: ScrollText },
};
const moduleOf = (key: string) => MODULES[key] ?? { label: key, icon: KeyRound };

// What "scope" means to a person, not a database enum.
const SCOPES: { value: string; label: string; short: string }[] = [
  { value: 'ALL_SCHOOL', label: 'Whole school', short: 'Whole school' },
  { value: 'OWN_CLASS', label: 'Their own classes', short: 'Own classes' },
  { value: 'OWN_SUBJECT', label: 'Their own subjects', short: 'Own subjects' },
  { value: 'OWN_STUDENTS', label: 'Their own students', short: 'Own students' },
  { value: 'OWN_CHILDREN', label: 'Their own children', short: 'Own children' },
  { value: 'SELF', label: 'Only themselves', short: 'Only themselves' },
];
const scopeShort = (value: string) => SCOPES.find((s) => s.value === value)?.short ?? value;

const ROLE_TILE: Record<string, string> = {
  Director: 'from-brand-blue to-brand-violet',
  Principal: 'from-violet-500 to-fuchsia-600',
  Teacher: 'from-emerald-400 to-teal-600',
  Accountant: 'from-amber-400 to-orange-500',
  Receptionist: 'from-sky-400 to-cyan-600',
  Parent: 'from-rose-400 to-pink-600',
};
const ROLE_ORDER = ['Director', 'Principal', 'Teacher', 'Accountant', 'Receptionist', 'Parent'];
const tileFor = (name: string) => ROLE_TILE[name] ?? 'from-slate-500 to-slate-700';

interface Grant {
  scope: string;
  readOnly: boolean;
}

export default function RolesPage() {
  const { data: roles, isLoading, isError } = useRoles();
  const { data: permissions } = usePermissionCatalog();
  const { can } = useCan();
  const canCreate = can('role.create');
  const canUpdate = can('role.update');

  const [openId, setOpenId] = useState<string | null>(null); // closed by default
  const [editing, setEditing] = useState<Role | 'new' | null>(null);

  const byKey = useMemo(() => new Map((permissions ?? []).map((p) => [p.key, p])), [permissions]);
  const customCount = roles?.filter((r) => !r.isSystem).length ?? 0;
  // Most senior first, then the other built-ins, then custom roles A–Z.
  const ordered = useMemo(() => {
    const rank = (r: Role) => {
      const i = ROLE_ORDER.indexOf(r.name);
      return r.isSystem && i >= 0 ? i : ROLE_ORDER.length;
    };
    return [...(roles ?? [])].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [roles]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Administration"
        title="Roles"
        description="Control what each type of staff member can see and do. Open a role to review — or change — its permissions."
        action={
          canCreate && (
            <Button onClick={() => setEditing('new')}>
              <Plus size={16} /> New role
            </Button>
          )
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Roles" tone="blue" icon={<ShieldCheck size={18} />} value={roles ? roles.length : <Skeleton className="h-8 w-12" />} />
        <StatCard label="Custom roles" tone="violet" icon={<Pencil size={18} />} value={roles ? customCount : <Skeleton className="h-8 w-12" />} hint="Roles your school created" />
        <StatCard label="Permissions available" tone="emerald" icon={<KeyRound size={18} />} value={permissions ? permissions.length : <Skeleton className="h-8 w-12" />} />
      </div>

      <div className="mt-6">
        {isError && <Alert variant="error">We couldn’t load roles. Please refresh and try again.</Alert>}
        {isLoading && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        )}
        {roles?.length === 0 && <EmptyState icon={<ShieldCheck size={22} />} title="No roles yet" />}

        <div className="flex flex-col gap-3">
          {ordered.map((role, i) => (
            <RoleAccordionItem
              key={role.id}
              role={role}
              index={i}
              open={openId === role.id}
              onToggle={() => setOpenId(openId === role.id ? null : role.id)}
              byKey={byKey}
              canUpdate={canUpdate}
              onEdit={() => setEditing(role)}
            />
          ))}
        </div>
      </div>

      <RoleEditor open={editing !== null} role={editing && editing !== 'new' ? editing : undefined} permissions={permissions ?? []} onClose={() => setEditing(null)} />
    </div>
  );
}

function RoleAccordionItem({
  role,
  index,
  open,
  onToggle,
  byKey,
  canUpdate,
  onEdit,
}: {
  role: Role;
  index: number;
  open: boolean;
  onToggle: () => void;
  byKey: Map<string, Permission>;
  canUpdate: boolean;
  onEdit: () => void;
}) {
  const isDirector = role.isSystem && role.name === 'Director';

  const grouped = useMemo(() => {
    const map = new Map<string, Role['permissions']>();
    role.permissions.forEach((p) => {
      const area = byKey.get(p.permissionKey)?.module ?? p.permissionKey.split('.')[0];
      map.set(area, [...(map.get(area) ?? []), p]);
    });
    return [...map.entries()].sort((a, b) => moduleOf(a[0]).label.localeCompare(moduleOf(b[0]).label));
  }, [role.permissions, byKey]);

  return (
    <article
      className={[
        'animate-fade-in-up overflow-hidden rounded-2xl border bg-white shadow-card transition-all duration-300',
        open ? 'border-brand-blue/30 shadow-elevated' : 'border-slate-200/80 hover:border-brand-blue/30 hover:shadow-elevated',
      ].join(' ')}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`role-panel-${role.id}`}
        className="flex w-full items-center gap-4 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue sm:p-5"
      >
        <span className={['flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-card', tileFor(role.name)].join(' ')}>
          <ShieldCheck size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-bold text-navy">{role.name}</h3>
            <Badge tone={role.isSystem ? 'neutral' : 'brand'}>{role.isSystem ? 'Built-in' : 'Custom'}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {isDirector ? 'Full access to everything' : `${role.permissions.length} ${role.permissions.length === 1 ? 'permission' : 'permissions'} across ${grouped.length} ${grouped.length === 1 ? 'area' : 'areas'}`}
          </p>
        </div>
        <span className={['flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-transform duration-300', open ? 'rotate-180 bg-brand-blue/10 text-brand-blue' : ''].join(' ')}>
          <ChevronDown size={18} />
        </span>
      </button>

      <div id={`role-panel-${role.id}`} className={['grid transition-[grid-template-rows,visibility] duration-300 ease-out', open ? 'visible grid-rows-[1fr]' : 'invisible grid-rows-[0fr]'].join(' ')}>
        <div className="overflow-hidden">
          <div className="border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-navy">What this role can do</p>
              {canUpdate &&
                (isDirector ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <Lock size={13} /> The Director role always keeps full access
                  </span>
                ) : (
                  <Button size="sm" onClick={onEdit}>
                    <Pencil size={14} /> Edit permissions
                  </Button>
                ))}
            </div>

            {grouped.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No permissions granted yet.{canUpdate && !isDirector ? ' Use “Edit permissions” to add some.' : ''}</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {grouped.map(([module, list]) => {
                  const { label, icon: Icon } = moduleOf(module);
                  return (
                    <section key={module} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
                      <h4 className="flex items-center gap-2 text-sm font-bold text-navy">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue">
                          <Icon size={15} />
                        </span>
                        {label}
                        <span className="ml-auto text-xs font-semibold text-slate-400">{list.length}</span>
                      </h4>
                      <ul className="mt-3 space-y-1.5">
                        {list.map((p) => (
                          <li key={p.permissionKey} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
                            <span>{byKey.get(p.permissionKey)?.description ?? p.permissionKey}</span>
                            {p.scope !== 'ALL_SCHOOL' && (
                              <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">{scopeShort(p.scope)}</span>
                            )}
                            {p.readOnly && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">View only</span>}
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function RoleEditor({ open, role, permissions, onClose }: { open: boolean; role?: Role; permissions: Permission[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isEdit = !!role;
  const [name, setName] = useState('');
  const [grants, setGrants] = useState<Map<string, Grant>>(new Map());
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Seed the form each time it opens: from the role being edited
  // (preserving every grant's scope and its read-only flag, so saving a
  // built-in role never quietly widens what it can reach) or empty.
  useEffect(() => {
    if (!open) return;
    setName(role?.name ?? '');
    setGrants(new Map((role?.permissions ?? []).map((p) => [p.permissionKey, { scope: p.scope, readOnly: p.readOnly }])));
    setFilter('');
    setError(null);
    setNameError(null);
  }, [open, role]);

  const groups = useMemo(() => {
    const words = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const map = new Map<string, Permission[]>();
    permissions.forEach((p) => {
      const haystack = `${p.description ?? ''} ${p.key} ${moduleOf(p.module).label}`.toLowerCase();
      if (words.every((w) => haystack.includes(w))) map.set(p.module, [...(map.get(p.module) ?? []), p]);
    });
    return [...map.entries()].sort((a, b) => moduleOf(a[0]).label.localeCompare(moduleOf(b[0]).label));
  }, [permissions, filter]);

  const toggle = (key: string) =>
    setGrants((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, { scope: 'ALL_SCHOOL', readOnly: false });
      return next;
    });

  const toggleModule = (list: Permission[]) =>
    setGrants((prev) => {
      const next = new Map(prev);
      const allOn = list.every((p) => next.has(p.key));
      list.forEach((p) => {
        if (allOn) next.delete(p.key);
        else if (!next.has(p.key)) next.set(p.key, { scope: 'ALL_SCHOOL', readOnly: false });
      });
      return next;
    });

  const patch = (key: string, change: Partial<Grant>) =>
    setGrants((prev) => {
      const next = new Map(prev);
      const current = next.get(key);
      if (current) next.set(key, { ...current, ...change });
      return next;
    });

  const submit = async () => {
    const trimmed = name.trim();
    if (!isEdit && trimmed.length < 2) {
      setNameError('Give the role a name (at least 2 characters).');
      return;
    }
    setNameError(null);
    setError(null);
    setSaving(true);
    const payload = [...grants.entries()].map(([permissionKey, g]) => ({ permissionKey, scope: g.scope, readOnly: g.readOnly }));
    try {
      if (role) await api.patch(`/roles/${role.id}`, { ...(role.isSystem ? {} : { name: trimmed }), permissions: payload });
      else await api.post('/roles', { name: trimmed, permissions: payload });
      await queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
      // The signed-in user's own permissions may have just changed.
      await queryClient.invalidateQueries({ queryKey: CURRENT_USER_QUERY_KEY });
      toast.show({
        tone: 'success',
        title: role ? `${role.name} updated` : `${trimmed} created`,
        description: `${payload.length} ${payload.length === 1 ? 'permission' : 'permissions'} granted.`,
      });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the role.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      eyebrow={<span className="text-xs font-semibold uppercase tracking-wide text-brand-blue">{isEdit ? 'Edit permissions' : 'New role'}</span>}
      title={isEdit ? `Edit ${role.name}` : 'Create a role'}
      description="Tick what this role may do. For each one you can also limit it to the person’s own classes, students or children."
      footer={
        <>
          <span className="mr-auto self-center text-sm font-medium text-slate-500">
            <span className="font-bold text-navy">{grants.size}</span> of {permissions.length} selected
          </span>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            {isEdit ? 'Save permissions' : 'Create role'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}
        {isEdit && role.isSystem ? (
          <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600">
            <Lock size={15} className="text-slate-400" /> Built-in role — its name is fixed, but you can change what it can do.
          </p>
        ) : (
          <TextField label="Role name" placeholder="e.g. Librarian, Front desk" value={name} onChange={(e) => setName(e.target.value)} error={nameError ?? undefined} />
        )}
        <SearchInput value={filter} onChange={setFilter} placeholder="Filter permissions…" aria-label="Filter permissions" />

        <div className="flex max-h-[46vh] flex-col gap-3 overflow-y-auto pr-1">
          {groups.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No permissions match “{filter}”.</p>}
          {groups.map(([module, list]) => {
            const { label, icon: Icon } = moduleOf(module);
            const onCount = list.filter((p) => grants.has(p.key)).length;
            return (
              <section key={module} className="rounded-2xl border border-slate-200 bg-white">
                <header className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue">
                    <Icon size={15} />
                  </span>
                  <h4 className="text-sm font-bold text-navy">{label}</h4>
                  <span className="text-xs font-semibold text-slate-400">
                    {onCount}/{list.length}
                  </span>
                  <button type="button" onClick={() => toggleModule(list)} className="ml-auto text-xs font-semibold text-brand-blue hover:underline">
                    {onCount === list.length ? 'Clear all' : 'Select all'}
                  </button>
                </header>
                <ul className="divide-y divide-slate-100">
                  {list.map((p) => {
                    const grant = grants.get(p.key);
                    return (
                      <li key={p.key} className={['flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 transition-colors', grant ? 'bg-brand-blue/[0.03]' : ''].join(' ')}>
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-sm text-slate-700">
                          <input type="checkbox" checked={!!grant} onChange={() => toggle(p.key)} className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-blue focus:ring-brand-blue" />
                          <span className={grant ? 'font-medium text-navy' : ''}>{p.description ?? p.key}</span>
                        </label>
                        {grant && (
                          <div className="flex animate-fade-in items-center gap-3">
                            <div className="w-44">
                              <SelectField fieldSize="sm" aria-label={`Scope for ${p.description ?? p.key}`} value={grant.scope} onChange={(e) => patch(p.key, { scope: e.target.value })}>
                                {SCOPES.map((s) => (
                                  <option key={s.value} value={s.value} title={s.label}>
                                    {s.short}
                                  </option>
                                ))}
                              </SelectField>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}
