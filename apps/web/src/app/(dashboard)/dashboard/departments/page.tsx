'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createDepartmentSchema, type CreateDepartmentInput } from '@schovexa/validation';
import { Alert, Button, ConfirmDialog, Dialog, EmptyState, PageHeader, SelectField, Skeleton, StatCard, TextAreaField, TextField, useToast } from '@schovexa/ui';
import { BookOpen, ChevronDown, Crown, GraduationCap, Hash, Pencil, Plus, Shapes, Trash2, UserPlus, X } from 'lucide-react';
import { DEPARTMENTS_QUERY_KEY, departmentQueryKey, useDepartment, useDepartments, type Department } from '../../../../hooks/useDepartments';
import { SUBJECTS_QUERY_KEY, useSubjects } from '../../../../hooks/useSubjects';
import { TEACHERS_QUERY_KEY, useTeachers } from '../../../../hooks/useTeachers';
import { useCan } from '../../../../hooks/useCan';
import { api, ApiError } from '../../../../lib/api-client';

const TILES = ['from-sky-400 to-blue-600', 'from-violet-400 to-purple-600', 'from-emerald-400 to-teal-600', 'from-amber-400 to-orange-500', 'from-rose-400 to-pink-600', 'from-cyan-400 to-sky-600'];
const tileFor = (name: string) => TILES[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) % TILES.length];

export default function DepartmentsPage() {
  const { can } = useCan();
  const { data: departments, isLoading, isError } = useDepartments();
  const [editing, setEditing] = useState<Department | 'new' | null>(null);
  const [removing, setRemoving] = useState<Department | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const canCreate = can('department.create');
  const canUpdate = can('department.update');

  const remove = async () => {
    if (!removing) return;
    try {
      await api.delete(`/departments/${removing.id}`);
      await Promise.all([DEPARTMENTS_QUERY_KEY, SUBJECTS_QUERY_KEY, TEACHERS_QUERY_KEY].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      toast.show({ tone: 'success', title: `${removing.name} removed`, description: 'Its subjects and teachers are now unassigned.' });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not remove the department', description: err instanceof ApiError ? err.message : 'Please try again.' });
    } finally {
      setRemoving(null);
    }
  };

  const totals = useMemo(() => ({ teachers: (departments ?? []).reduce((n, d) => n + d.teacherCount, 0), subjects: (departments ?? []).reduce((n, d) => n + d.subjectCount, 0) }), [departments]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Teaching"
        title="Departments"
        description="Group subjects and teachers into departments — Science, Languages, Sports — each with a head."
        action={canCreate ? <Button onClick={() => setEditing('new')}><Plus size={16} /> New department</Button> : undefined}
      />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Departments" tone="blue" icon={<Shapes size={18} />} value={departments ? departments.length : <Skeleton className="h-8 w-12" />} />
        <StatCard label="Teachers placed" tone="violet" icon={<GraduationCap size={18} />} value={departments ? totals.teachers : <Skeleton className="h-8 w-12" />} />
        <StatCard label="Subjects placed" tone="emerald" icon={<BookOpen size={18} />} value={departments ? totals.subjects : <Skeleton className="h-8 w-12" />} />
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {isError && <Alert variant="error">We couldn’t load departments. Please refresh and try again.</Alert>}
        {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        {departments?.length === 0 && (
          <EmptyState icon={<Shapes size={22} />} title="No departments yet" description="Create departments like Science or Languages, then place subjects and teachers in them." action={canCreate ? <Button onClick={() => setEditing('new')}>Create the first department</Button> : undefined} />
        )}
        {departments?.map((d) => {
          const open = openId === d.id;
          return (
            <article key={d.id} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card transition-shadow hover:shadow-elevated">
              <div className="flex flex-wrap items-center gap-4 p-5">
                <button type="button" onClick={() => setOpenId(open ? null : d.id)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                  <span className={['flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-base font-extrabold text-white shadow-card', tileFor(d.name)].join(' ')}>{(d.code || d.name).replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase()}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-base font-bold text-navy">{d.name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1.5"><Crown size={13} /> {d.headTeacher ? d.headTeacher.name : 'No head yet'}</span>
                      <span className="inline-flex items-center gap-1.5"><GraduationCap size={13} /> {d.teacherCount} {d.teacherCount === 1 ? 'teacher' : 'teachers'}</span>
                      <span className="inline-flex items-center gap-1.5"><BookOpen size={13} /> {d.subjectCount} {d.subjectCount === 1 ? 'subject' : 'subjects'}</span>
                    </span>
                  </span>
                  <ChevronDown size={18} className={['ml-auto shrink-0 text-slate-400 transition-transform', open ? 'rotate-180' : ''].join(' ')} />
                </button>
                {canUpdate && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" aria-label={`Edit ${d.name}`} onClick={() => setEditing(d)}><Pencil size={14} /> Edit</Button>
                    <Button size="sm" variant="soft-danger" aria-label={`Remove ${d.name}`} onClick={() => setRemoving(d)}><Trash2 size={14} /></Button>
                  </div>
                )}
              </div>
              {open && <DepartmentMembers department={d} canUpdate={canUpdate} />}
            </article>
          );
        })}
      </div>

      <DepartmentDialog open={editing !== null} department={editing && editing !== 'new' ? editing : undefined} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!removing}
        tone="danger"
        title={`Remove ${removing?.name ?? 'department'}?`}
        description="Its subjects and teachers aren’t deleted — they just stop belonging to a department."
        confirmLabel="Remove"
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

function DepartmentMembers({ department, canUpdate }: { department: Department; canUpdate: boolean }) {
  const { data: detail } = useDepartment(department.id);
  const { data: subjects } = useSubjects();
  const { data: teachers } = useTeachers();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [subjectId, setSubjectId] = useState('');
  const [teacherId, setTeacherId] = useState('');

  const refresh = () => Promise.all([departmentQueryKey(department.id), DEPARTMENTS_QUERY_KEY, SUBJECTS_QUERY_KEY, TEACHERS_QUERY_KEY].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  const assign = async (kind: 'subjects' | 'teachers', id: string, departmentId: string) => {
    try {
      await api.patch(`/${kind}/${id}`, { departmentId });
      await refresh();
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not update', description: err instanceof ApiError ? err.message : 'Please try again.' });
    }
  };

  const freeSubjects = subjects?.filter((s) => s.departmentId !== department.id) ?? [];
  const freeTeachers = teachers?.filter((t) => t.department?.id !== department.id) ?? [];

  const Chip = ({ label, sub, onRemove }: { label: string; sub?: string; onRemove?: () => void }) => (
    <li className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-3 pr-1.5 text-sm text-slate-700">
      <span className="font-medium">{label}</span>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
      {onRemove && (
        <button type="button" onClick={onRemove} className="rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${label} from ${department.name}`}>
          <X size={13} />
        </button>
      )}
    </li>
  );

  return (
    <div className="grid grid-cols-1 gap-6 border-t border-slate-100 bg-slate-50/50 p-5 md:grid-cols-2">
      {department.description && <p className="md:col-span-2 text-sm text-slate-600">{department.description}</p>}
      <section aria-label="Teachers">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Teachers</h3>
        {!detail && <Skeleton className="h-10 rounded-xl" />}
        {detail?.teachers.length === 0 && <p className="text-sm text-slate-400">No teachers in this department.</p>}
        <ul className="flex flex-wrap gap-2">
          {detail?.teachers.map((t) => <Chip key={t.id} label={t.name} sub={department.headTeacher?.id === t.id ? 'Head' : undefined} onRemove={canUpdate ? () => assign('teachers', t.id, '') : undefined} />)}
        </ul>
        {canUpdate && freeTeachers.length > 0 && (
          <div className="mt-3 flex items-end gap-2">
            <div className="flex-1">
              <SelectField aria-label={`Add a teacher to ${department.name}`} fieldSize="sm" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">Add a teacher…</option>
                {freeTeachers.map((t) => <option key={t.id} value={t.id}>{t.user.firstName} {t.user.lastName}{t.department ? ` (now in ${t.department.name})` : ''}</option>)}
              </SelectField>
            </div>
            <Button size="sm" variant="secondary" disabled={!teacherId} onClick={async () => { await assign('teachers', teacherId, department.id); setTeacherId(''); }}><UserPlus size={14} /> Add</Button>
          </div>
        )}
      </section>
      <section aria-label="Subjects">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Subjects</h3>
        {!detail && <Skeleton className="h-10 rounded-xl" />}
        {detail?.subjects.length === 0 && <p className="text-sm text-slate-400">No subjects in this department.</p>}
        <ul className="flex flex-wrap gap-2">
          {detail?.subjects.map((s) => <Chip key={s.id} label={s.name} sub={s.code ?? undefined} onRemove={canUpdate ? () => assign('subjects', s.id, '') : undefined} />)}
        </ul>
        {canUpdate && freeSubjects.length > 0 && (
          <div className="mt-3 flex items-end gap-2">
            <div className="flex-1">
              <SelectField aria-label={`Add a subject to ${department.name}`} fieldSize="sm" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="">Add a subject…</option>
                {freeSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}{s.department ? ` (now in ${s.department.name})` : ''}</option>)}
              </SelectField>
            </div>
            <Button size="sm" variant="secondary" disabled={!subjectId} onClick={async () => { await assign('subjects', subjectId, department.id); setSubjectId(''); }}><Plus size={14} /> Add</Button>
          </div>
        )}
      </section>
    </div>
  );
}

function DepartmentDialog({ open, onClose, department }: { open: boolean; onClose: () => void; department?: Department }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: teachers } = useTeachers();
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = !!department;
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateDepartmentInput>({
    resolver: zodResolver(createDepartmentSchema),
    values: department ? { name: department.name, code: department.code ?? '', description: department.description ?? '', headTeacherId: department.headTeacher?.id ?? '' } : { name: '', code: '', description: '', headTeacherId: '' },
  });

  const close = () => {
    setServerError(null);
    reset();
    onClose();
  };
  const onSubmit = async (data: CreateDepartmentInput) => {
    setServerError(null);
    try {
      if (department) await api.patch(`/departments/${department.id}`, data);
      else await api.post('/departments', data);
      await Promise.all([DEPARTMENTS_QUERY_KEY, ...(department ? [departmentQueryKey(department.id)] : [])].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      toast.show({ tone: 'success', title: department ? `${data.name} updated` : `${data.name} created` });
      close();
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        err.details.forEach((d) => setError(d.field as keyof CreateDepartmentInput, { type: 'server', message: d.message }));
      } else {
        setServerError(err instanceof ApiError ? err.message : 'Could not save the department.');
      }
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      eyebrow={<span className="text-xs font-semibold uppercase tracking-wide text-brand-blue">{isEdit ? 'Edit department' : 'New department'}</span>}
      title={isEdit ? `Edit ${department.name}` : 'Create a department'}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={close}>Cancel</Button>
          <Button type="submit" form="department-form" loading={isSubmitting}>{isEdit ? 'Save changes' : 'Create department'}</Button>
        </>
      }
    >
      <form id="department-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {serverError && <Alert variant="error">{serverError}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2"><TextField label="Name" placeholder="Science" leftIcon={<Shapes size={16} />} error={errors.name?.message} {...register('name')} /></div>
          <TextField label="Code" placeholder="SCI" leftIcon={<Hash size={16} />} helperText="Optional." error={errors.code?.message} {...register('code')} />
        </div>
        <SelectField label="Head of department" leftIcon={<Crown size={16} />} helperText="Optional. Pick from your teachers." error={errors.headTeacherId?.message} {...register('headTeacherId')}>
          <option value="">No head yet</option>
          {teachers?.map((t) => <option key={t.id} value={t.id}>{t.user.firstName} {t.user.lastName}</option>)}
        </SelectField>
        <TextAreaField label="Description" rows={3} placeholder="What this department covers" error={errors.description?.message} {...register('description')} />
      </form>
    </Dialog>
  );
}

