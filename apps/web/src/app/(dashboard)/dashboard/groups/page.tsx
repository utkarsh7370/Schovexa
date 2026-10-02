'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createGroupSchema, GROUP_KINDS, type CreateGroupInput } from '@schovexa/validation';
import { Alert, Button, ConfirmDialog, Dialog, EmptyState, PageHeader, SearchInput, SelectField, Skeleton, StatCard, Tabs, TextField, useToast } from '@schovexa/ui';
import { ChevronDown, Crown, Flag, GraduationCap, Pencil, Plus, Trash2, Trophy, UserMinus, UserPlus, Users } from 'lucide-react';
import { GROUPS_QUERY_KEY, GROUP_KIND_LABELS, groupQueryKey, useGroup, useGroups, type Group, type GroupKind } from '../../../../hooks/useGroups';
import { STUDENTS_QUERY_KEY, useStudentsPage } from '../../../../hooks/useStudents';
import { useTeachers } from '../../../../hooks/useTeachers';
import { useDebouncedValue } from '../../../../hooks/useDebouncedValue';
import { useCan } from '../../../../hooks/useCan';
import { api, ApiError } from '../../../../lib/api-client';

const COLOR_CHOICES = ['#dc2626', '#2563eb', '#16a34a', '#eab308', '#9333ea', '#ea580c', '#0891b2', '#db2777'];
const FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'HOUSE', label: 'Houses' },
  { id: 'CLUB', label: 'Clubs' },
  { id: 'SPORTS', label: 'Sports teams' },
  { id: 'OTHER', label: 'Other groups' },
];

export default function GroupsPage() {
  const { can } = useCan();
  const { data: groups, isLoading, isError } = useGroups();
  const [filter, setFilter] = useState('ALL');
  const [editing, setEditing] = useState<Group | 'new' | null>(null);
  const [removing, setRemoving] = useState<Group | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const canCreate = can('group.create');
  const canUpdate = can('group.update');

  const shown = (groups ?? []).filter((g) => filter === 'ALL' || g.kind === filter);
  const members = (groups ?? []).reduce((n, g) => n + g.memberCount, 0);

  const remove = async () => {
    if (!removing) return;
    try {
      await api.delete(`/groups/${removing.id}`);
      await queryClient.invalidateQueries({ queryKey: GROUPS_QUERY_KEY });
      toast.show({ tone: 'success', title: `${removing.name} removed` });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not remove it', description: err instanceof ApiError ? err.message : 'Please try again.' });
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Teaching"
        title="Houses & groups"
        description="Houses, clubs and teams students belong to. A student is in one house, and can join any number of clubs."
        action={canCreate ? <Button onClick={() => setEditing('new')}><Plus size={16} /> New house or group</Button> : undefined}
      />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Houses & groups" tone="blue" icon={<Trophy size={18} />} value={groups ? groups.length : <Skeleton className="h-8 w-12" />} />
        <StatCard label="Houses" tone="violet" icon={<Flag size={18} />} value={groups ? groups.filter((g) => g.kind === 'HOUSE').length : <Skeleton className="h-8 w-12" />} />
        <StatCard label="Memberships" tone="emerald" icon={<Users size={18} />} value={groups ? members : <Skeleton className="h-8 w-12" />} />
      </div>

      <div className="mt-6"><Tabs tabs={FILTERS} value={filter} onChange={setFilter} /></div>

      <div className="mt-6 flex flex-col gap-4">
        {isError && <Alert variant="error">We couldn’t load houses and groups. Please refresh and try again.</Alert>}
        {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        {groups && shown.length === 0 && (
          <EmptyState
            icon={<Trophy size={22} />}
            title={filter === 'ALL' ? 'No houses or groups yet' : 'Nothing here yet'}
            description="Create houses like Red and Blue, or clubs like Chess and Drama, then add students to them."
            action={canCreate ? <Button onClick={() => setEditing('new')}>Create one</Button> : undefined}
          />
        )}
        {shown.map((g) => {
          const open = openId === g.id;
          return (
            <article key={g.id} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card transition-shadow hover:shadow-elevated" style={{ borderLeft: `6px solid ${g.color}` }}>
              <div className="flex flex-wrap items-center gap-4 p-5">
                <button type="button" onClick={() => setOpenId(open ? null : g.id)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold text-white shadow-card" style={{ backgroundColor: g.color }}>{g.name.charAt(0).toUpperCase()}</span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-base font-bold text-navy">{g.name}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{GROUP_KIND_LABELS[g.kind]}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1.5"><Users size={13} /> {g.memberCount} {g.memberCount === 1 ? 'student' : 'students'}</span>
                      {g.leader && <span className="inline-flex items-center gap-1.5"><Crown size={13} /> {g.leader.name}</span>}
                      {g.motto && <span className="italic text-slate-400">“{g.motto}”</span>}
                    </span>
                  </span>
                  <ChevronDown size={18} className={['ml-auto shrink-0 text-slate-400 transition-transform', open ? 'rotate-180' : ''].join(' ')} />
                </button>
                {canUpdate && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" aria-label={`Edit ${g.name}`} onClick={() => setEditing(g)}><Pencil size={14} /> Edit</Button>
                    <Button size="sm" variant="soft-danger" aria-label={`Remove ${g.name}`} onClick={() => setRemoving(g)}><Trash2 size={14} /></Button>
                  </div>
                )}
              </div>
              {open && <GroupMembers group={g} canUpdate={canUpdate} />}
            </article>
          );
        })}
      </div>

      <GroupDialog open={editing !== null} group={editing && editing !== 'new' ? editing : undefined} onClose={() => setEditing(null)} />
      <ConfirmDialog open={!!removing} tone="danger" title={`Remove ${removing?.name ?? 'this group'}?`} description="Students aren’t deleted — they just leave the group." confirmLabel="Remove" onConfirm={remove} onCancel={() => setRemoving(null)} />
    </div>
  );
}

function GroupMembers({ group, canUpdate }: { group: Group; canUpdate: boolean }) {
  const { data: detail } = useGroup(group.id);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const { data: results } = useStudentsPage({ page: 1, pageSize: 8, search: q, status: 'ENROLLED' });

  const memberIds = new Set(detail?.members.map((m) => m.studentId));
  const candidates = (results?.items ?? []).filter((s) => !memberIds.has(s.id));

  const refresh = () => Promise.all([groupQueryKey(group.id), GROUPS_QUERY_KEY, STUDENTS_QUERY_KEY].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  const add = async (studentId: string) => {
    try {
      await api.post(`/groups/${group.id}/members`, { studentIds: [studentId] });
      await refresh();
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not add the student', description: err instanceof ApiError ? err.message : 'Please try again.' });
    }
  };
  const removeMember = async (studentId: string) => {
    try {
      await api.delete(`/groups/${group.id}/members/${studentId}`);
      await refresh();
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not remove the student', description: err instanceof ApiError ? err.message : 'Please try again.' });
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 border-t border-slate-100 bg-slate-50/50 p-5 md:grid-cols-2">
      {group.description && <p className="text-sm text-slate-600 md:col-span-2">{group.description}</p>}
      <section aria-label="Members">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Members</h3>
        {!detail && <Skeleton className="h-16 rounded-xl" />}
        {detail?.members.length === 0 && <p className="text-sm text-slate-400">No students yet.</p>}
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100 bg-white">
          {detail?.members.map((m) => (
            <li key={m.studentId} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-navy">{m.name}</span>
                <span className="text-xs text-slate-500">{m.admissionNo}{m.className ? ` · ${m.className}` : ''}</span>
              </span>
              {canUpdate && (
                <button type="button" onClick={() => removeMember(m.studentId)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${m.name} from ${group.name}`}>
                  <UserMinus size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      {canUpdate && (
        <section aria-label="Add students">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Add students</h3>
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name or admission number…" aria-label={`Find students to add to ${group.name}`} />
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">
            {candidates.length === 0 && <li className="px-3 py-3 text-sm text-slate-400">{results ? 'No matching students to add.' : 'Searching…'}</li>}
            {candidates.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <GraduationCap size={15} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate"><span className="font-semibold text-navy">{s.firstName} {s.lastName}</span> <span className="text-xs text-slate-500">{s.admissionNo}{s.section ? ` · ${s.section.class.name} ${s.section.name}` : ''}</span></span>
                <Button size="sm" variant="secondary" aria-label={`Add ${s.firstName} ${s.lastName} to ${group.name}`} onClick={() => add(s.id)}><UserPlus size={14} /> Add</Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function GroupDialog({ open, onClose, group }: { open: boolean; onClose: () => void; group?: Group }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: teachers } = useTeachers();
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = !!group;
  const initial = useMemo<CreateGroupInput>(
    () => (group ? { name: group.name, kind: group.kind, color: group.color, motto: group.motto ?? '', description: group.description ?? '', leaderTeacherId: group.leader?.id ?? '' } : { name: '', kind: 'HOUSE', color: COLOR_CHOICES[0], motto: '', description: '', leaderTeacherId: '' }),
    [group],
  );
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateGroupInput>({ resolver: zodResolver(createGroupSchema), values: initial });
  const color = watch('color');

  const close = () => {
    setServerError(null);
    reset();
    onClose();
  };
  const onSubmit = async (data: CreateGroupInput) => {
    setServerError(null);
    try {
      if (group) await api.patch(`/groups/${group.id}`, data);
      else await api.post('/groups', data);
      await Promise.all([GROUPS_QUERY_KEY, ...(group ? [groupQueryKey(group.id)] : [])].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      toast.show({ tone: 'success', title: group ? `${data.name} updated` : `${data.name} created` });
      close();
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        err.details.forEach((d) => setError(d.field as keyof CreateGroupInput, { type: 'server', message: d.message }));
      } else {
        setServerError(err instanceof ApiError ? err.message : 'Could not save.');
      }
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      eyebrow={<span className="text-xs font-semibold uppercase tracking-wide text-brand-blue">{isEdit ? 'Edit' : 'New house or group'}</span>}
      title={isEdit ? `Edit ${group.name}` : 'Create a house or group'}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={close}>Cancel</Button>
          <Button type="submit" form="group-form" loading={isSubmitting}>{isEdit ? 'Save changes' : 'Create'}</Button>
        </>
      }
    >
      <form id="group-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {serverError && <Alert variant="error">{serverError}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Name" placeholder="Red House" leftIcon={<Trophy size={16} />} error={errors.name?.message} {...register('name')} />
          <SelectField label="Type" error={errors.kind?.message} {...register('kind')}>
            {GROUP_KINDS.map((k: GroupKind) => <option key={k} value={k}>{GROUP_KIND_LABELS[k]}</option>)}
          </SelectField>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold text-navy">Colour</p>
          <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
            {COLOR_CHOICES.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => setValue('color', c, { shouldDirty: true })} className={['h-8 w-8 rounded-full ring-offset-2 transition-all', color === c ? 'ring-2 ring-navy' : 'hover:scale-110'].join(' ')} style={{ backgroundColor: c }} />
            ))}
          </div>
          {errors.color?.message && <p role="alert" className="mt-1 text-sm font-medium text-red-600">{errors.color.message}</p>}
        </div>
        <TextField label="Motto" placeholder="Courage and fire" helperText="Optional." error={errors.motto?.message} {...register('motto')} />
        <SelectField label="Led by" leftIcon={<Crown size={16} />} helperText="Optional. The house master or club teacher." error={errors.leaderTeacherId?.message} {...register('leaderTeacherId')}>
          <option value="">Nobody yet</option>
          {teachers?.map((t) => <option key={t.id} value={t.id}>{t.user.firstName} {t.user.lastName}</option>)}
        </SelectField>
        <TextField label="Description" helperText="Optional." error={errors.description?.message} {...register('description')} />
      </form>
    </Dialog>
  );
}
