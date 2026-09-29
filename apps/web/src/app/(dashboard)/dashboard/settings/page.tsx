'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { updateSchoolSchema, type UpdateSchoolInput } from '@schovexa/validation';
import { Button, Card, TextField, Alert, PageHeader, SkeletonRows } from '@schovexa/ui';
import { useCurrentSchool, CURRENT_SCHOOL_QUERY_KEY } from '../../../../hooks/useCurrentSchool';
import { api, ApiError } from '../../../../lib/api-client';

export default function SchoolSettingsPage() {
  const { data: school } = useCurrentSchool();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdateSchoolInput>({ resolver: zodResolver(updateSchoolSchema) });

  useEffect(() => {
    if (school) {
      reset({
        name: school.name,
        address: school.address ?? '',
        contactEmail: school.contactEmail ?? '',
        contactPhone: school.contactPhone ?? '',
        website: school.website ?? '',
      });
    }
  }, [school, reset]);

  const onSubmit = async (data: UpdateSchoolInput) => {
    setServerError(null);
    setSaved(false);
    try {
      await api.patch('/schools/me', data);
      await queryClient.invalidateQueries({ queryKey: CURRENT_SCHOOL_QUERY_KEY });
      setSaved(true);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not save changes.');
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="School Settings" description="Update your school's profile and contact details." />

      {!school && <SkeletonRows count={3} />}
      {school && (
        <Card className="mt-6 p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {serverError && <Alert variant="error">{serverError}</Alert>}
            {saved && <Alert variant="success">Saved.</Alert>}

            <TextField label="School name" error={errors.name?.message} {...register('name')} />
            <TextField label="Address" error={errors.address?.message} {...register('address')} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Contact email" type="email" error={errors.contactEmail?.message} {...register('contactEmail')} />
              <TextField label="Contact phone" error={errors.contactPhone?.message} {...register('contactPhone')} />
            </div>
            <TextField label="Website" error={errors.website?.message} {...register('website')} />

            <div>
              <Button type="submit" loading={isSubmitting}>
                Save changes
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
