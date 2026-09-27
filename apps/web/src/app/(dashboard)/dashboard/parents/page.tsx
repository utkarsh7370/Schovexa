'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createParentSchema, type CreateParentInput } from '@schovexa/validation';
import { Button, Card, TextField, Alert } from '@schovexa/ui';
import { useParents, PARENTS_QUERY_KEY } from '../../../../hooks/useParents';
import { api, ApiError } from '../../../../lib/api-client';

export default function ParentsPage() {
  const { data: parents } = useParents();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateParentInput>({ resolver: zodResolver(createParentSchema) });

  const onCreate = async (data: CreateParentInput) => {
    setServerError(null);
    try {
      await api.post('/parents', data);
      await queryClient.invalidateQueries({ queryKey: PARENTS_QUERY_KEY });
      reset();
      setCreating(false);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not create parent profile.');
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Parents</h1>
          <p className="mt-1 text-slate-600">Parent and guardian contact records.</p>
        </div>
        {!creating && <Button onClick={() => setCreating(true)}>New parent</Button>}
      </div>

      {creating && (
        <Card className="mt-6 p-6">
          <form onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-4">
            {serverError && <Alert variant="error">{serverError}</Alert>}
            <div className="grid grid-cols-2 gap-3">
              <TextField label="First name" error={errors.firstName?.message} {...register('firstName')} />
              <TextField label="Last name" error={errors.lastName?.message} {...register('lastName')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Phone" placeholder="Optional" error={errors.phone?.message} {...register('phone')} />
              <TextField label="Email" type="email" placeholder="Optional" error={errors.email?.message} {...register('email')} />
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
        {parents?.map((parent) => (
          <Card key={parent.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium text-navy">
                {parent.firstName} {parent.lastName}
              </p>
              <p className="text-sm text-slate-500">{[parent.phone, parent.email].filter(Boolean).join(' · ') || 'No contact info'}</p>
            </div>
          </Card>
        ))}
        {parents?.length === 0 && !creating && (
          <p className="py-8 text-center text-sm text-slate-500">No parent profiles yet.</p>
        )}
      </div>
    </div>
  );
}
