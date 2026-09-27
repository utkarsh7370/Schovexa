'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  createClassSchema,
  createSectionSchema,
  type CreateSectionInput,
} from '@schovexa/validation';
import { Button, Card, TextField, Alert } from '@schovexa/ui';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useAcademicYears } from '../../../../hooks/useAcademicYears';
import { useClasses, classesQueryKey } from '../../../../hooks/useClasses';
import { useSections, sectionsQueryKey } from '../../../../hooks/useSections';
import { useTeachers } from '../../../../hooks/useTeachers';
import { api, ApiError } from '../../../../lib/api-client';

// academicYearId is fixed to the currently viewed year, not a form
// field — validating the full schema against form values would always
// fail (the field is never registered) and silently swallow every
// submit, since react-hook-form never calls onSubmit when the resolver
// rejects the values.
const classFormSchema = createClassSchema.omit({ academicYearId: true });
type ClassFormInput = z.infer<typeof classFormSchema>;

export default function ClassesPage() {
  const { data: years } = useAcademicYears();
  const currentYear = years?.find((y) => y.isCurrent) ?? years?.[0];
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: classes } = useClasses(currentYear?.id);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClassFormInput>({ resolver: zodResolver(classFormSchema) });

  const onCreate = async (data: ClassFormInput) => {
    if (!currentYear) return;
    setServerError(null);
    try {
      await api.post('/classes', { ...data, academicYearId: currentYear.id });
      await queryClient.invalidateQueries({ queryKey: classesQueryKey(currentYear.id) });
      reset();
      setCreating(false);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not create class.');
    }
  };

  if (years && years.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-navy">Classes</h1>
        <Alert variant="warning" className="mt-4">
          You need an academic year before adding classes.{' '}
          <Link href="/dashboard/academic-years" className="font-medium underline">
            Create one first.
          </Link>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Classes</h1>
          <p className="mt-1 text-slate-600">
            {currentYear ? `Classes and sections for ${currentYear.name}.` : 'Manage your school’s classes.'}
          </p>
        </div>
        {!creating && currentYear && (
          <Button onClick={() => setCreating(true)} disabled={!currentYear}>
            New class
          </Button>
        )}
      </div>

      {creating && (
        <Card className="mt-6 p-6">
          <form onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-4">
            {serverError && <Alert variant="error">{serverError}</Alert>}
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Name" placeholder="Grade 5" error={errors.name?.message} {...register('name')} />
              <TextField
                label="Order"
                type="number"
                placeholder="5"
                error={errors.order?.message}
                {...register('order')}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" loading={isSubmitting}>
                Create
              </Button>
              <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="mt-6 flex flex-col gap-2">
        {classes?.map((klass) => (
          <ClassRow
            key={klass.id}
            classId={klass.id}
            name={klass.name}
            order={klass.order}
            expanded={expandedClassId === klass.id}
            onToggle={() => setExpandedClassId(expandedClassId === klass.id ? null : klass.id)}
          />
        ))}
        {classes?.length === 0 && !creating && (
          <p className="py-8 text-center text-sm text-slate-500">No classes yet for this academic year.</p>
        )}
      </div>
    </div>
  );
}

function ClassRow({
  classId,
  name,
  order,
  expanded,
  onToggle,
}: {
  classId: string;
  name: string;
  order: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Card className="p-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className="font-medium text-navy">{name}</span>
          <span className="text-sm text-slate-400">order {order}</span>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-slate-200 p-4">
          <SectionsPanel classId={classId} />
        </div>
      )}
    </Card>
  );
}

function SectionsPanel({ classId }: { classId: string }) {
  const { data: sections } = useSections(classId);
  const { data: teachers } = useTeachers();
  const [addingSection, setAddingSection] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busySectionId, setBusySectionId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateSectionInput>({ resolver: zodResolver(createSectionSchema) });

  const onCreate = async (data: CreateSectionInput) => {
    setServerError(null);
    try {
      await api.post(`/classes/${classId}/sections`, data);
      await queryClient.invalidateQueries({ queryKey: sectionsQueryKey(classId) });
      reset();
      setAddingSection(false);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not create section.');
    }
  };

  const setClassTeacher = async (sectionId: string, classTeacherId: string) => {
    setBusySectionId(sectionId);
    try {
      await api.patch(`/sections/${sectionId}`, { classTeacherId });
      await queryClient.invalidateQueries({ queryKey: sectionsQueryKey(classId) });
    } finally {
      setBusySectionId(null);
    }
  };

  const teacherName = (id: string | null) => {
    if (!id) return null;
    const teacher = teachers?.find((t) => t.id === id);
    return teacher ? `${teacher.user.firstName} ${teacher.user.lastName}` : null;
  };

  return (
    <div className="flex flex-col gap-3">
      {sections?.map((section) => (
        <div key={section.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
          <div>
            <p className="text-sm font-medium text-navy">Section {section.name}</p>
            <p className="text-xs text-slate-500">
              Class teacher: {teacherName(section.classTeacherId) ?? 'Unassigned'}
            </p>
          </div>
          <select
            className="h-8 rounded-md border border-slate-300 px-2 text-xs focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
            value={section.classTeacherId ?? ''}
            disabled={busySectionId === section.id}
            onChange={(e) => setClassTeacher(section.id, e.target.value)}
          >
            <option value="">Unassigned</option>
            {teachers?.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.user.firstName} {teacher.user.lastName}
              </option>
            ))}
          </select>
        </div>
      ))}
      {sections?.length === 0 && !addingSection && <p className="text-sm text-slate-500">No sections yet.</p>}

      {addingSection ? (
        <form onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
          {serverError && <Alert variant="error">{serverError}</Alert>}
          <TextField label="Section name" placeholder="A" error={errors.name?.message} {...register('name')} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={isSubmitting}>
              Add section
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setAddingSection(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setAddingSection(true)}>
          Add section
        </Button>
      )}
    </div>
  );
}
