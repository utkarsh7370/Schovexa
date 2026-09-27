'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@schovexa/validation';
import { Button, Card, TextField, Alert } from '@schovexa/ui';
import { api } from '../../../lib/api-client';

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = async (data: ForgotPasswordInput) => {
    // Always show the same generic success state, whether or not the
    // email exists (docs/authentication.md §6) — no enumeration.
    await api.post('/auth/forgot-password', data);
    setSubmitted(true);
  };

  return (
    <Card className="p-8">
      <h1 className="text-xl font-bold text-navy">Reset your password</h1>

      {submitted ? (
        <Alert variant="success" className="mt-6">
          If that email exists, a reset link has been sent.
        </Alert>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4">
          <TextField label="Email" type="email" error={errors.email?.message} {...register('email')} />
          <Button type="submit" loading={isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link href="/login" className="font-medium text-brand-blue hover:underline">
          Back to log in
        </Link>
      </p>
    </Card>
  );
}
