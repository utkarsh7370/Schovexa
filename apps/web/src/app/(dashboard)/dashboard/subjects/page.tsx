'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createSubjectSchema, updateSubjectSchema, type CreateSubjectInput, type UpdateSubjectInput } from '@schovexa/validation';
import { Button, Card, TextField, Alert, PageHeader, EmptyState, SkeletonRows } from '@schovexa/ui';
import { BookOpen } from 'lucide-react';
import { useSubjects, SUBJECTS_QUERY_KEY, type Subject } from '../../../../hooks/useSubjects';
import { api, ApiError } from '../../../../lib/api-client';

export default function SubjectsPage() {
  const { data: subjects, isLoading } = useSubjects();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateSubjectInput>({ resolver: zodResolver(createSubjectSchema) });

  const onCreate = async (data: CreateSubjectInput) => {
    setServerError(null);
    try {
      await api.post('/subjects', data);
      await queryClient.invalidateQueries({ queryKey: SUBJECTS_QUERY_KEY });
      reset();
      setCreating(false);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not create subject.');
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Subjects"
        description="Manage the subjects taught at your school."
        action={!creating && <Button onClick={() => setCreating(true)}>New subject</Button>}
      />

      {creating && (
        <Card className="mt-6 p-6">
          <form onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-4">
            {serverError && <Alert variant="error">{serverError}</Alert>}
            <TextField label="Name" placeholder="Mathematics" error={errors.name?.message} {...register('name')} />
            <TextField label="Code" placeholder="MATH" helperText="Optional." error={errors.code?.message} {...register('code')} />
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

      <div className="mt-6">
        {isLoading && <SkeletonRows count={4} />}
        {!isLoading && subjects?.length === 0 && !creating && (
          <EmptyState icon={<BookOpen size={22} />} title="No subjects yet" />
        )}
        {!isLoading && subjects && subjects.length > 0 && (
          <div className="flex flex-col gap-2">
            {subjects.map((subject) =>
              editingId === subject.id ? (
                <SubjectEditRow key={subject.id} subject={subject} onDone={() => setEditingId(null)} />
              ) : (
                <Card key={subject.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium text-navy">{subject.name}</p>
                    {subject.code && <p className="text-sm text-slate-500">{subject.code}</p>}
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setEditingId(subject.id)}>
                    Edit
                  </Button>
                </Card>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SubjectEditRow({ subject, onDone }: { subject: Subject; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateSubjectInput>({
    resolver: zodResolver(updateSubjectSchema),
    defaultValues: { name: subject.name, code: subject.code ?? '' },
  });

  const onSave = async (data: UpdateSubjectInput) => {
    setServerError(null);
    try {
      await api.patch(`/subjects/${subject.id}`, data);
      await queryClient.invalidateQueries({ queryKey: SUBJECTS_QUERY_KEY });
      onDone();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not save subject.');
    }
  };

  return (
    <Card className="p-4">
      <form onSubmit={handleSubmit(onSave)} className="flex flex-col gap-3">
        {serverError && <Alert variant="error">{serverError}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Name" error={errors.name?.message} {...register('name')} />
          <TextField label="Code" error={errors.code?.message} {...register('code')} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" loading={isSubmitting}>
            Save
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
