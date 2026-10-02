'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createTeacherAssignmentSchema, createTeacherSchema, type CreateTeacherInput } from '@schovexa/validation';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Dialog,
  EmptyState,
  PageHeader,
  Pagination,
  SearchInput,
  SelectField,
  Skeleton,
  StatCard,
  TextField,
  useToast,
} from '@schovexa/ui';
import Link from 'next/link';
import { ArrowUpRight, BookOpen, CalendarDays, ChevronDown, GraduationCap, Hash, Mail, Plus, SearchX, Shapes, UserPlus2, Users, X } from 'lucide-react';
import { useMemberships } from '../../../../hooks/useMemberships';
import { useTeachers, TEACHERS_QUERY_KEY, useTeacherAssignments, teacherAssignmentsQueryKey } from '../../../../hooks/useTeachers';
import { useClasses } from '../../../../hooks/useClasses';
import { useSections } from '../../../../hooks/useSections';
import { useSubjects } from '../../../../hooks/useSubjects';
import { useDepartments } from '../../../../hooks/useDepartments';
import { useCan } from '../../../../hooks/useCan';
import { api, ApiError } from '../../../../lib/api-client';

const PAGE_SIZES = [10, 20, 50];

export default function TeachersPage() {
  const { data: memberships } = useMemberships();
  const { can } = useCan();
  const { data: departments } = useDepartments(can('department.view'));
  const { data: teachers, isLoading, isError } = useTeachers();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Assignments load lazily, the first time a row is opened — and stay
  // mounted afterwards so collapsing animates instead of snapping shut.
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);

  const teacherUserIds = new Set(teachers?.map((t) => t.user.id));
  const eligibleMembers = memberships?.filter((m) => m.status === 'ACTIVE' && !teacherUserIds.has(m.user.id));

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateTeacherInput>({ resolver: zodResolver(createTeacherSchema) });

  const closeForm = () => {
    setCreating(false);
    setServerError(null);
    reset();
  };

  const onCreate = async (data: CreateTeacherInput) => {
    setServerError(null);
    try {
      await api.post('/teachers', data);
      await queryClient.invalidateQueries({ queryKey: TEACHERS_QUERY_KEY });
      closeForm();
      toast.show({ tone: 'success', title: 'Teacher profile created', description: 'You can now assign classes and subjects.' });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not create teacher profile.');
    }
  };

  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return teachers ?? [];
    return (teachers ?? []).filter((t) => {
      const haystack = `${t.user.firstName} ${t.user.lastName} ${t.user.email} ${t.employeeCode ?? ''}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
  }, [teachers, query]);

  useEffect(() => setPage(1), [query, pageSize]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggle = (id: string) => {
    setOpened((prev) => new Set(prev).add(id));
    setExpandedId((current) => (current === id ? null : id));
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="People"
        title="Teachers"
        description="Teacher profiles and the classes and subjects they teach."
        action={
          <Button onClick={() => setCreating(true)}>
            <UserPlus2 size={16} /> New teacher profile
          </Button>
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Teacher profiles" tone="blue" icon={<GraduationCap size={18} />} value={teachers ? teachers.length : <Skeleton className="h-8 w-14" />} />
        <StatCard
          label="Staff without a teacher profile"
          tone="amber"
          icon={<Users size={18} />}
          value={eligibleMembers ? eligibleMembers.length : <Skeleton className="h-8 w-14" />}
          hint="Active staff you can promote to a teacher"
        />
      </div>

      {teachers && teachers.length > 0 && (
        <div className="mt-6">
          <SearchInput value={query} onChange={setQuery} placeholder="Search teachers by name, email or employee code…" aria-label="Search teachers" />
        </div>
      )}

      <div className="mt-6">
        {isError && <Alert variant="error">We couldn’t load teachers. Please refresh and try again.</Alert>}
        {isLoading && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        )}
        {!isLoading && !isError && teachers?.length === 0 && (
          <EmptyState
            icon={<GraduationCap size={22} />}
            title="No teacher profiles yet"
            description="Invite staff first, then give them a teacher profile to assign classes and subjects."
            action={<Button onClick={() => setCreating(true)}>Create a teacher profile</Button>}
          />
        )}
        {teachers && teachers.length > 0 && filtered.length === 0 && (
          <EmptyState
            icon={<SearchX size={22} />}
            title="No teachers match"
            description={`Nothing matches “${query}”.`}
            action={
              <Button variant="secondary" onClick={() => setQuery('')}>
                Clear search
              </Button>
            }
          />
        )}

        <div className="flex flex-col gap-3">
          {visible.map((teacher, i) => {
            const name = `${teacher.user.firstName} ${teacher.user.lastName}`;
            const open = expandedId === teacher.id;
            return (
              <article
                key={teacher.id}
                className={[
                  'animate-fade-in-up overflow-hidden rounded-2xl border bg-white shadow-card transition-all duration-300',
                  open ? 'border-brand-blue/30 shadow-elevated' : 'border-slate-200/80 hover:border-brand-blue/30 hover:shadow-elevated',
                ].join(' ')}
                style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
              >
                <button
                  type="button"
                  onClick={() => toggle(teacher.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-4 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue sm:p-5"
                >
                  <Avatar name={name} tone="auto" size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold text-navy">{name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1.5 truncate">
                        <Mail size={13} /> {teacher.user.email}
                      </span>
                      {teacher.department && (
                        <span className="inline-flex items-center gap-1.5 font-medium text-brand-blue">
                          <Shapes size={13} /> {teacher.department.name}
                        </span>
                      )}
                      {teacher.joiningDate && (
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays size={13} /> Joined {new Date(teacher.joiningDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </p>
                  </div>
                  {teacher.employeeCode && (
                    <span className="hidden items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-600 sm:inline-flex">
                      <Hash size={12} /> {teacher.employeeCode}
                    </span>
                  )}
                  <span className={['flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-transform duration-300', open ? 'rotate-180 bg-brand-blue/10 text-brand-blue' : ''].join(' ')}>
                    <ChevronDown size={18} />
                  </span>
                </button>

                <div className={['grid transition-[grid-template-rows,visibility] duration-300 ease-out', open ? 'visible grid-rows-[1fr]' : 'invisible grid-rows-[0fr]'].join(' ')}>
                  <div className="overflow-hidden">
                    {opened.has(teacher.id) && (
                      <div className="border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5">
                        <div className="mb-4 flex justify-end">
                          <Link href={`/dashboard/teachers/${teacher.id}`} className="group/link inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:underline">
                            Open full profile <ArrowUpRight size={15} className="transition-transform group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5" />
                          </Link>
                        </div>
                        <AssignmentsPanel teacherId={teacher.id} />
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {filtered.length > 0 && (
          <div className="mt-6">
            <Pagination
              page={safePage}
              totalPages={totalPages}
              total={filtered.length}
              pageSize={pageSize}
              noun={filtered.length === 1 ? 'teacher' : 'teachers'}
              pageSizeOptions={PAGE_SIZES}
              onPageChange={(p) => {
                setPage(p);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onPageSizeChange={setPageSize}
            />
          </div>
        )}
      </div>

      <Dialog
        open={creating}
        onClose={closeForm}
        size="lg"
        eyebrow={<span className="text-xs font-semibold uppercase tracking-wide text-brand-blue">New teacher</span>}
        title="Create a teacher profile"
        description="Pick an active staff member. Assign their classes and subjects after."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit" form="teacher-form" loading={isSubmitting} disabled={eligibleMembers?.length === 0}>
              Create profile
            </Button>
          </>
        }
      >
        <form id="teacher-form" onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-4" noValidate>
          {serverError && <Alert variant="error">{serverError}</Alert>}
          <SelectField
            label="Staff member"
            leftIcon={<Users size={16} />}
            error={errors.userId?.message}
            helperText={eligibleMembers?.length === 0 ? 'Every active staff member already has a teacher profile. Invite more staff first.' : undefined}
            {...register('userId')}
          >
            <option value="">Select a staff member</option>
            {eligibleMembers?.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.firstName} {m.user.lastName} ({m.user.email})
              </option>
            ))}
          </SelectField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="Employee code" placeholder="EMP-001" helperText="Optional." leftIcon={<Hash size={16} />} error={errors.employeeCode?.message} {...register('employeeCode')} />
            <TextField label="Joining date" type="date" helperText="Optional." error={errors.joiningDate?.message} {...register('joiningDate')} />
          </div>
          {departments && departments.length > 0 && (
            <SelectField label="Department" leftIcon={<Shapes size={16} />} helperText="Optional." {...register('departmentId')}>
              <option value="">No department</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </SelectField>
          )}
        </form>
      </Dialog>
    </div>
  );
}

function AssignmentsPanel({ teacherId }: { teacherId: string }) {
  const { data: assignments, isLoading } = useTeacherAssignments(teacherId);
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [busyAssignmentId, setBusyAssignmentId] = useState<string | null>(null);
  const { data: sectionsForClass } = useSections(selectedClassId || undefined);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(createTeacherAssignmentSchema), defaultValues: { sectionId: '', subjectId: '' } });

  const close = () => {
    setAdding(false);
    setSelectedClassId('');
    setServerError(null);
    reset();
  };

  const onAdd = handleSubmit(async (data) => {
    setServerError(null);
    try {
      await api.post(`/teachers/${teacherId}/assignments`, data);
      await queryClient.invalidateQueries({ queryKey: teacherAssignmentsQueryKey(teacherId) });
      close();
      toast.show({ tone: 'success', title: 'Assignment added' });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not add assignment.');
    }
  });

  const removeAssignment = async (assignmentId: string) => {
    setBusyAssignmentId(assignmentId);
    try {
      await api.delete(`/teachers/${teacherId}/assignments/${assignmentId}`);
      await queryClient.invalidateQueries({ queryKey: teacherAssignmentsQueryKey(teacherId) });
      toast.show({ tone: 'success', title: 'Assignment removed' });
    } finally {
      setBusyAssignmentId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-navy">
          <BookOpen size={16} className="text-brand-blue" /> Classes &amp; subjects
          {assignments && <Badge tone="brand">{assignments.length}</Badge>}
        </h3>
        {!adding && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus size={15} /> Add assignment
          </Button>
        )}
      </div>

      {isLoading && <Skeleton className="h-10 w-full" />}

      {assignments && assignments.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {assignments.map((a) => (
            <li
              key={a.id}
              className="group inline-flex animate-scale-in items-center gap-2 rounded-xl border border-slate-200 bg-white py-1.5 pl-3 pr-1.5 text-sm shadow-card"
            >
              <span className="font-semibold text-navy">
                {a.section.class.name} · {a.section.name}
              </span>
              <span className="rounded-md bg-brand-blue/10 px-2 py-0.5 text-xs font-semibold text-brand-blue">{a.subject.name}</span>
              <button
                type="button"
                onClick={() => removeAssignment(a.id)}
                disabled={busyAssignmentId === a.id}
                aria-label={`Remove ${a.section.class.name} ${a.section.name} ${a.subject.name}`}
                className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {assignments?.length === 0 && !adding && <p className="text-sm text-slate-500">No classes or subjects assigned yet.</p>}

      {adding && (
        <form onSubmit={onAdd} className="flex animate-fade-in-up flex-col gap-4 rounded-2xl border border-brand-blue/20 bg-white p-4" noValidate>
          {serverError && <Alert variant="error">{serverError}</Alert>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SelectField
              label="Class"
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                setValue('sectionId', '');
              }}
            >
              <option value="">Select class</option>
              {classes?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Section" disabled={!selectedClassId} error={errors.sectionId ? 'Choose a section.' : undefined} {...register('sectionId')}>
              <option value="">Select section</option>
              {sectionsForClass?.map((s) => (
                <option key={s.id} value={s.id}>
                  Section {s.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Subject" error={errors.subjectId ? 'Choose a subject.' : undefined} {...register('subjectId')}>
              <option value="">Select subject</option>
              {subjects?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={isSubmitting}>
              Add assignment
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
