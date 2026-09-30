'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { createClassSchema, createSectionSchema, type CreateSectionInput } from '@schovexa/validation';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Dialog,
  EmptyState,
  PageHeader,
  SelectField,
  Skeleton,
  StatCard,
  TextField,
  useToast,
} from '@schovexa/ui';
import { CalendarDays, ChevronDown, GraduationCap, Layers, Plus, School, Shapes } from 'lucide-react';
import { useAcademicYears } from '../../../../hooks/useAcademicYears';
import { useClasses, classesQueryKey } from '../../../../hooks/useClasses';
import { useSections, sectionsQueryKey } from '../../../../hooks/useSections';
import { useTeachers } from '../../../../hooks/useTeachers';
import { api, ApiError } from '../../../../lib/api-client';

// academicYearId is fixed to the year being viewed, not a form field —
// validating the full schema against form values would always fail (the
// field is never registered) and silently swallow every submit, since
// react-hook-form never calls onSubmit when the resolver rejects.
const classFormSchema = createClassSchema.omit({ academicYearId: true });
type ClassFormInput = z.infer<typeof classFormSchema>;

export default function ClassesPage() {
  const { data: years, isLoading: yearsLoading } = useAcademicYears();
  const [pickedYearId, setPickedYearId] = useState('');
  const viewedYear = years?.find((y) => y.id === pickedYearId) ?? years?.find((y) => y.isCurrent) ?? years?.[0];
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: classes, isLoading } = useClasses(viewedYear?.id);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClassFormInput>({ resolver: zodResolver(classFormSchema) });

  const closeForm = () => {
    setCreating(false);
    setServerError(null);
    reset();
  };

  const onCreate = async (data: ClassFormInput) => {
    if (!viewedYear) return;
    setServerError(null);
    try {
      await api.post('/classes', { ...data, academicYearId: viewedYear.id });
      await queryClient.invalidateQueries({ queryKey: classesQueryKey(viewedYear.id) });
      closeForm();
      toast.show({ tone: 'success', title: `${data.name} added`, description: 'Open it to add sections.' });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not create class.');
    }
  };

  if (years && years.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader eyebrow="Teaching" title="Classes" />
        <div className="mt-6">
          <EmptyState
            icon={<CalendarDays size={22} />}
            title="You need an academic year first"
            description="Classes belong to an academic year, so create one before adding classes."
            action={
              <Link href="/dashboard/academic-years">
                <Button>Create an academic year</Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Teaching"
        title="Classes"
        description={viewedYear ? `Classes and their sections for ${viewedYear.name}.` : 'Classes and their sections.'}
        action={
          viewedYear && (
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} /> New class
            </Button>
          )
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Classes" tone="blue" icon={<School size={18} />} value={classes ? classes.length : <Skeleton className="h-8 w-12" />} hint={viewedYear?.name} />
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:col-span-2">
          <SelectField
            label="Academic year"
            leftIcon={<CalendarDays size={16} />}
            value={viewedYear?.id ?? ''}
            disabled={yearsLoading}
            onChange={(e) => {
              setPickedYearId(e.target.value);
              setExpandedId(null);
            }}
            helperText={viewedYear?.isCurrent ? 'This is your current academic year.' : 'You are viewing a year that is not the current one.'}
          >
            {years?.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.isCurrent ? ' (current)' : ''}
              </option>
            ))}
          </SelectField>
        </div>
      </div>

      <div className="mt-6">
        {isLoading && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        )}
        {!isLoading && classes?.length === 0 && (
          <EmptyState
            icon={<School size={22} />}
            title="No classes yet for this academic year"
            description="Add classes like “Grade 1” or “Class 8”, then split each into sections."
            action={<Button onClick={() => setCreating(true)}>Add the first class</Button>}
          />
        )}

        <div className="flex flex-col gap-3">
          {classes?.map((klass, i) => (
            <ClassRow
              key={klass.id}
              index={i}
              classId={klass.id}
              name={klass.name}
              order={klass.order}
              expanded={expandedId === klass.id}
              onToggle={() => setExpandedId(expandedId === klass.id ? null : klass.id)}
            />
          ))}
        </div>
      </div>

      <Dialog
        open={creating}
        onClose={closeForm}
        size="lg"
        eyebrow={<span className="text-xs font-semibold uppercase tracking-wide text-brand-blue">New class · {viewedYear?.name}</span>}
        title="Add a class"
        description="Order decides where the class appears in lists — 1 comes first."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit" form="class-form" loading={isSubmitting}>
              Add class
            </Button>
          </>
        }
      >
        <form id="class-form" onSubmit={handleSubmit(onCreate)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          {serverError && (
            <div className="sm:col-span-2">
              <Alert variant="error">{serverError}</Alert>
            </div>
          )}
          <TextField label="Name" placeholder="Grade 5" leftIcon={<School size={16} />} error={errors.name?.message} {...register('name')} />
          <TextField label="Order" type="number" placeholder="5" error={errors.order?.message} {...register('order')} />
        </form>
      </Dialog>
    </div>
  );
}

function ClassRow({
  classId,
  name,
  order,
  expanded,
  onToggle,
  index,
}: {
  classId: string;
  name: string;
  order: number;
  expanded: boolean;
  onToggle: () => void;
  index: number;
}) {
  // Sections load for every row (not only expanded ones) so the header can
  // say how many there are; React Query shares the result with the panel.
  const { data: sections } = useSections(classId);
  const { data: teachers } = useTeachers();
  const [opened, setOpened] = useState(false);

  const teacherIds = new Set(sections?.map((s) => s.classTeacherId).filter(Boolean));
  const teacherNames = [...teacherIds].map((id) => teachers?.find((t) => t.id === id)).filter(Boolean);

  return (
    <article
      className={[
        'animate-fade-in-up overflow-hidden rounded-2xl border bg-white shadow-card transition-all duration-300',
        expanded ? 'border-brand-blue/30 shadow-elevated' : 'border-slate-200/80 hover:border-brand-blue/30 hover:shadow-elevated',
      ].join(' ')}
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
    >
      <button
        type="button"
        onClick={() => {
          setOpened(true);
          onToggle();
        }}
        aria-expanded={expanded}
        className="flex w-full items-center gap-4 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue sm:p-5"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-electric to-brand-blue text-lg font-extrabold text-white shadow-glow">
          {order}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-navy">{name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
            <Layers size={13} /> {sections ? `${sections.length} ${sections.length === 1 ? 'section' : 'sections'}` : '…'}
          </p>
        </div>
        {teacherNames.length > 0 && (
          <div className="hidden items-center gap-2 sm:flex" title={teacherNames.map((t) => `${t!.user.firstName} ${t!.user.lastName}`).join(', ')}>
            <div className="flex -space-x-2">
              {teacherNames.slice(0, 4).map((t) => (
                <Avatar key={t!.id} name={`${t!.user.firstName} ${t!.user.lastName}`} tone="auto" size={28} ring />
              ))}
            </div>
            <span className="text-xs font-medium text-slate-500">{teacherNames.length} class {teacherNames.length === 1 ? 'teacher' : 'teachers'}</span>
          </div>
        )}
        <span className={['flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-transform duration-300', expanded ? 'rotate-180 bg-brand-blue/10 text-brand-blue' : ''].join(' ')}>
          <ChevronDown size={18} />
        </span>
      </button>

      <div className={['grid transition-[grid-template-rows] duration-300 ease-out', expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'].join(' ')}>
        <div className="overflow-hidden">
          {opened && (
            <div className="border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5">
              <SectionsPanel classId={classId} />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function SectionsPanel({ classId }: { classId: string }) {
  const { data: sections, isLoading } = useSections(classId);
  const { data: teachers } = useTeachers();
  const [adding, setAdding] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busySectionId, setBusySectionId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateSectionInput>({ resolver: zodResolver(createSectionSchema) });

  const close = () => {
    setAdding(false);
    setServerError(null);
    reset();
  };

  const onCreate = async (data: CreateSectionInput) => {
    setServerError(null);
    try {
      await api.post(`/classes/${classId}/sections`, data);
      await queryClient.invalidateQueries({ queryKey: sectionsQueryKey(classId) });
      close();
      toast.show({ tone: 'success', title: `Section ${data.name} added` });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not create section.');
    }
  };

  const setClassTeacher = async (sectionId: string, classTeacherId: string) => {
    setBusySectionId(sectionId);
    try {
      await api.patch(`/sections/${sectionId}`, { classTeacherId });
      await queryClient.invalidateQueries({ queryKey: sectionsQueryKey(classId) });
      toast.show({ tone: 'success', title: classTeacherId ? 'Class teacher assigned' : 'Class teacher removed' });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not update the class teacher', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusySectionId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-navy">
          <Shapes size={16} className="text-brand-blue" /> Sections
          {sections && <Badge tone="brand">{sections.length}</Badge>}
        </h3>
        {!adding && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus size={15} /> Add section
          </Button>
        )}
      </div>

      {isLoading && <Skeleton className="h-16 w-full" />}

      {sections && sections.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {sections.map((section) => {
            const teacher = teachers?.find((t) => t.id === section.classTeacherId);
            const teacherName = teacher ? `${teacher.user.firstName} ${teacher.user.lastName}` : null;
            return (
              <div key={section.id} className="animate-scale-in rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-base font-extrabold text-brand-blue">{section.name}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-navy">Section {section.name}</p>
                    <div className="flex items-center gap-1.5 truncate text-xs text-slate-500">
                      {teacherName ? (
                        <>
                          <Avatar name={teacherName} tone="auto" size={16} /> {teacherName}
                        </>
                      ) : (
                        <>
                          <GraduationCap size={13} /> No class teacher yet
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {teachers && (
                  <div className="mt-3">
                    <SelectField
                      fieldSize="sm"
                      aria-label={`Class teacher for section ${section.name}`}
                      value={section.classTeacherId ?? ''}
                      disabled={busySectionId === section.id}
                      onChange={(e) => setClassTeacher(section.id, e.target.value)}
                    >
                      <option value="">No class teacher</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.user.firstName} {t.user.lastName}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {sections?.length === 0 && !adding && <p className="text-sm text-slate-500">No sections yet — add one to start enrolling students.</p>}

      {adding && (
        <form onSubmit={handleSubmit(onCreate)} className="flex animate-fade-in-up flex-col gap-4 rounded-2xl border border-brand-blue/20 bg-white p-4" noValidate>
          {serverError && <Alert variant="error">{serverError}</Alert>}
          <TextField label="Section name" placeholder="A" error={errors.name?.message} {...register('name')} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={isSubmitting}>
              Add section
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
