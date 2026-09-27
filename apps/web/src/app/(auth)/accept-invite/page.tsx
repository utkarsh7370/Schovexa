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

function AcceptInviteForm() {
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
      setServerError('This invite link is missing its token.');
      return;
    }
    setServerError(null);
    try {
      await api.post('/auth/accept-invite', { token, password: data.password });
      router.push('/login');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'This invite link is invalid or has expired.');
    }
  };

  return (
    <Card className="p-8">
      <h1 className="text-xl font-bold text-navy">Set up your account</h1>
      <p className="mt-1 text-sm text-slate-500">Choose a password to activate your account.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4">
        {serverError && <Alert variant="error">{serverError}</Alert>}
        {!token && <Alert variant="warning">No invite token found in this link.</Alert>}

        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          helperText="At least 10 characters."
          error={errors.password?.message}
          {...register('password')}
        />

        <Button type="submit" loading={isSubmitting} disabled={!token}>
          Activate account
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
export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      }
    >
      <AcceptInviteForm />
    </Suspense>
  );
}
