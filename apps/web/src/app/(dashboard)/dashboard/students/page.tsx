'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { createStudentSchema } from '@schovexa/validation';
import { Button, Card, TextField, Alert, PageHeader, Badge, EmptyState, SkeletonRows, useToast, type BadgeTone } from '@schovexa/ui';
import { Search, UserPlus2, Users } from 'lucide-react';
import { useStudents, STUDENTS_QUERY_KEY } from '../../../../hooks/useStudents';
import { useClasses } from '../../../../hooks/useClasses';
import { useSections } from '../../../../hooks/useSections';
import { api, ApiError } from '../../../../lib/api-client';

// sectionId is chosen via a class -> section cascade in this form, but
// the API only takes a flat sectionId — this local schema mirrors the
// shared one so the resolver validates exactly what the form collects.
const studentFormSchema = createStudentSchema;
type StudentFormInput = z.infer<typeof studentFormSchema>;

const STATUS_LABELS: Record<string, string> = {
  ENROLLED: 'Enrolled',
  TRANSFERRED: 'Transferred',
  GRADUATED: 'Graduated',
  WITHDRAWN: 'Withdrawn',
};

const STATUS_TONES: Record<string, BadgeTone> = {
  ENROLLED: 'success',
  TRANSFERRED: 'info',
  GRADUATED: 'brand',
  WITHDRAWN: 'neutral',
};

export default function StudentsPage() {
  const { data: students, isLoading } = useStudents();
  const { data: classes } = useClasses();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const { data: sectionsForClass } = useSections(selectedClassId || undefined);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<StudentFormInput>({ resolver: zodResolver(studentFormSchema) });

  const onCreate = async (data: StudentFormInput) => {
    setServerError(null);
    try {
      const created = await api.post<{ id: string; admissionNo: string; firstName: string; lastName: string }>(
        '/students',
        data,
      );
      await queryClient.invalidateQueries({ queryKey: STUDENTS_QUERY_KEY });
      reset();
      setSelectedClassId('');
      setCreating(false);
      toast.show({
        tone: 'success',
        title: `${created.firstName} ${created.lastName} added`,
        description: `Admission no. ${created.admissionNo}`,
      });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not create student.');
    }
  };

  const filtered = useMemo(() => {
    if (!students) return students;
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) || s.admissionNo.toLowerCase().includes(q),
    );
  }, [students, query]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Students"
        description="Everyone enrolled at your school, in one place."
        action={
          !creating && (
            <Button onClick={() => setCreating(true)}>
              <UserPlus2 size={16} /> New admission
            </Button>
          )
        }
      />

      {creating && (
        <Card className="mt-6 p-6">
          <h2 className="text-base font-semibold text-navy">Admit a new student</h2>
          <p className="mt-1 text-sm text-slate-500">A few basics to get started — you can add the rest later.</p>
          <form onSubmit={handleSubmit(onCreate)} className="mt-4 flex flex-col gap-4">
            {serverError && <Alert variant="error">{serverError}</Alert>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField
                label="Admission number"
                placeholder="A-001"
                error={errors.admissionNo?.message}
                {...register('admissionNo')}
              />
              <TextField label="Gender" placeholder="Optional" error={errors.gender?.message} {...register('gender')} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField label="First name" error={errors.firstName?.message} {...register('firstName')} />
              <TextField label="Last name" error={errors.lastName?.message} {...register('lastName')} />
            </div>
            <TextField
              label="Date of birth"
              type="date"
              helperText="Optional."
              error={errors.dateOfBirth?.message}
              {...register('dateOfBirth')}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-navy">Class</label>
                <select
                  className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  value={selectedClassId}
                  onChange={(e) => {
                    setSelectedClassId(e.target.value);
                    setValue('sectionId', '');
                  }}
                >
                  <option value="">Not assigned yet</option>
                  {classes?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-navy">Section</label>
                <select
                  className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  disabled={!selectedClassId}
                  {...register('sectionId')}
                >
                  <option value="">Not assigned yet</option>
                  {sectionsForClass?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" loading={isSubmitting}>
                Add student
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setCreating(false);
                  setSelectedClassId('');
                  reset();
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {students && students.length > 0 && (
        <div className="relative mt-6">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or admission number…"
            className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
          />
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {isLoading && <SkeletonRows count={5} />}

        {filtered?.map((student) => (
          <Link key={student.id} href={`/dashboard/students/${student.id}`}>
            <Card className="flex items-center justify-between p-4 transition-shadow hover:shadow-elevated">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-sm font-semibold text-brand-blue">
                  {student.firstName[0]}
                  {student.lastName[0]}
                </div>
                <div>
                  <p className="font-medium text-navy">
                    {student.firstName} {student.lastName}
                  </p>
                  <p className="text-sm text-slate-500">Admission no. {student.admissionNo}</p>
                </div>
              </div>
              <Badge tone={STATUS_TONES[student.status] ?? 'neutral'}>{STATUS_LABELS[student.status] ?? student.status}</Badge>
            </Card>
          </Link>
        ))}

        {!isLoading && students?.length === 0 && !creating && (
          <EmptyState
            icon={<Users size={22} />}
            title="No students yet"
            description="Add your first student to start tracking attendance, fees, and records."
            action={<Button onClick={() => setCreating(true)}>Add a student</Button>}
          />
        )}

        {!isLoading && students && students.length > 0 && filtered?.length === 0 && (
          <EmptyState
            icon={<Search size={22} />}
            title="No matches"
            description={`Nothing matches "${query}". Try a different name or admission number.`}
            action={
              <Button variant="secondary" onClick={() => setQuery('')}>
                Clear search
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}
