'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { createStudentSchema } from '@schovexa/validation';
import { Button, Card, TextField, Alert } from '@schovexa/ui';
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

export default function StudentsPage() {
  const { data: students } = useStudents();
  const { data: classes } = useClasses();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
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
      await api.post('/students', data);
      await queryClient.invalidateQueries({ queryKey: STUDENTS_QUERY_KEY });
      reset();
      setSelectedClassId('');
      setCreating(false);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not create student.');
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Students</h1>
          <p className="mt-1 text-slate-600">Admissions and student records.</p>
        </div>
        {!creating && <Button onClick={() => setCreating(true)}>New admission</Button>}
      </div>

      {creating && (
        <Card className="mt-6 p-6">
          <form onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-4">
            {serverError && <Alert variant="error">{serverError}</Alert>}
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Admission number"
                placeholder="A-001"
                error={errors.admissionNo?.message}
                {...register('admissionNo')}
              />
              <TextField label="Gender" placeholder="Optional" error={errors.gender?.message} {...register('gender')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
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
            <div className="grid grid-cols-2 gap-3">
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
                  <option value="">Unassigned</option>
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
                  <option value="">Unassigned</option>
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
                Create
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

      <div className="mt-6 flex flex-col gap-2">
        {students?.map((student) => (
          <Link key={student.id} href={`/dashboard/students/${student.id}`}>
            <Card className="flex items-center justify-between p-4 hover:bg-slate-50">
              <div>
                <p className="font-medium text-navy">
                  {student.firstName} {student.lastName}
                </p>
                <p className="text-sm text-slate-500">Admission no. {student.admissionNo}</p>
              </div>
              <span className="text-sm text-slate-500">{STATUS_LABELS[student.status] ?? student.status}</span>
            </Card>
          </Link>
        ))}
        {students?.length === 0 && !creating && (
          <p className="py-8 text-center text-sm text-slate-500">No students yet.</p>
        )}
      </div>
    </div>
  );
}
