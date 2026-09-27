'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { passwordSchema } from '@schovexa/validation';
import { Button, Card, TextField, Alert, Spinner } from '@schovexa/ui';
import { api, ApiError } from '../../../lib/api-client';

const formSchema = z.object({ password: passwordSchema });
type FormInput = z.infer<typeof formSchema>;

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token');
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({ resolver: zodResolver(formSchema) });

  const onSubmit = async (data: FormInput) => {
    if (!token) {
      setServerError('This reset link is missing its token.');
      return;
    }
    setServerError(null);
    try {
      await api.post('/auth/reset-password', { token, password: data.password });
      router.push('/login');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'This link is invalid or has expired.');
    }
  };

  return (
    <Card className="p-8">
      <h1 className="text-xl font-bold text-navy">Set a new password</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4">
        {serverError && <Alert variant="error">{serverError}</Alert>}
        {!token && <Alert variant="warning">No reset token found in this link.</Alert>}

        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          helperText="At least 10 characters."
          error={errors.password?.message}
          {...register('password')}
        />

        <Button type="submit" loading={isSubmitting} disabled={!token}>
          Set new password
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link href="/login" className="font-medium text-brand-blue hover:underline">
          Back to log in
        </Link>
      </p>
    </Card>
  );
}

// useSearchParams() requires a Suspense boundary for the App Router to
// statically generate this page — without it, `next build` fails outright
// (caught while running the actual production build, not assumed away).
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
