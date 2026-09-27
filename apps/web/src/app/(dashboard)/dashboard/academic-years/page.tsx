'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createAcademicYearSchema, type CreateAcademicYearInput } from '@schovexa/validation';
import { Button, Card, TextField, Alert } from '@schovexa/ui';
import { useAcademicYears, ACADEMIC_YEARS_QUERY_KEY } from '../../../../hooks/useAcademicYears';
import { api, ApiError } from '../../../../lib/api-client';

export default function AcademicYearsPage() {
  const { data: years } = useAcademicYears();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateAcademicYearInput>({ resolver: zodResolver(createAcademicYearSchema) });

  const onCreate = async (data: CreateAcademicYearInput) => {
    setServerError(null);
    try {
      await api.post('/academic-years', data);
      await queryClient.invalidateQueries({ queryKey: ACADEMIC_YEARS_QUERY_KEY });
      reset();
      setCreating(false);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not create academic year.');
    }
  };

  const setCurrent = async (id: string) => {
    setBusyId(id);
    try {
      await api.post(`/academic-years/${id}/set-current`);
      await queryClient.invalidateQueries({ queryKey: ACADEMIC_YEARS_QUERY_KEY });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Academic Years</h1>
          <p className="mt-1 text-slate-600">Manage your school&apos;s academic years.</p>
        </div>
        {!creating && <Button onClick={() => setCreating(true)}>New academic year</Button>}
      </div>

      {creating && (
        <Card className="mt-6 p-6">
          <form onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-4">
            {serverError && <Alert variant="error">{serverError}</Alert>}
            <TextField label="Name" placeholder="2026-27" error={errors.name?.message} {...register('name')} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Start date" type="date" error={errors.startDate?.message} {...register('startDate')} />
              <TextField label="End date" type="date" error={errors.endDate?.message} {...register('endDate')} />
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
        {years?.map((year) => (
          <Card key={year.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium text-navy">{year.name}</p>
              <p className="text-sm text-slate-500">
                {new Date(year.startDate).toLocaleDateString()} – {new Date(year.endDate).toLocaleDateString()}
              </p>
            </div>
            {year.isCurrent ? (
              <span className="rounded-full bg-brand-blue/10 px-3 py-1 text-xs font-semibold text-brand-blue">
                Current
              </span>
            ) : (
              <Button size="sm" variant="secondary" loading={busyId === year.id} onClick={() => setCurrent(year.id)}>
                Set current
              </Button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
