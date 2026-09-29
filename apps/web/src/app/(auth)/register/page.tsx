'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchoolSchema, type RegisterSchoolInput } from '@schovexa/validation';
import { Button, Card, TextField, Alert } from '@schovexa/ui';
import { api, ApiError } from '../../../lib/api-client';

export default function RegisterSchoolPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterSchoolInput>({ resolver: zodResolver(registerSchoolSchema) });

  const onSubmit = async (data: RegisterSchoolInput) => {
    setServerError(null);
    try {
      // Registration auto-logs in AND auto-selects the new school
      // server-side (docs/api.md §7) — straight to the dashboard.
      await api.post('/schools/register', data);
      router.push('/dashboard');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <Card className="p-8">
      <h1 className="text-xl font-bold text-navy">Register your school</h1>
      <p className="mt-1 text-sm text-slate-500">
        Create your school&apos;s workspace and your director account in one step.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4">
        {serverError && <Alert variant="error">{serverError}</Alert>}

        <TextField label="School name" error={errors.schoolName?.message} {...register('schoolName')} />

        <div className="grid grid-cols-2 gap-3">
          <TextField label="First name" error={errors.directorFirstName?.message} {...register('directorFirstName')} />
          <TextField label="Last name" error={errors.directorLastName?.message} {...register('directorLastName')} />
        </div>

        <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          helperText="At least 10 characters."
          error={errors.password?.message}
          {...register('password')}
        />

        <p className="text-xs text-slate-500">
          By creating a school, you agree to our{' '}
          <Link href="/terms-of-service" className="text-brand-blue underline">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy-policy" className="text-brand-blue underline">
            Privacy Policy
          </Link>
          .
        </p>

        <Button type="submit" loading={isSubmitting} className="mt-2">
          Create school
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-brand-blue hover:underline">
          Log in
        </Link>
      </p>
    </Card>
  );
}
