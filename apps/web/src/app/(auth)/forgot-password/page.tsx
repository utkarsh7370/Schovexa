'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordFormSchema, type ForgotPasswordFormInput } from '@schovexa/validation';
import { Button, Card, TextField, Alert, useToast } from '@schovexa/ui';
import { ArrowLeft, KeyRound, Mail, MailCheck } from 'lucide-react';
import { api } from '../../../lib/api-client';
import { applyServerErrors } from '../../../lib/forms';
import { AuthCardHeader } from '../../../components/auth-card-header';

export default function ForgotPasswordPage() {
  const toast = useToast();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormInput, unknown, { email: string }>({
    resolver: zodResolver(forgotPasswordFormSchema),
    mode: 'onTouched',
    defaultValues: { email: '' },
  });

  const onSubmit = async (data: { email: string }) => {
    setServerError(null);
    try {
      // Always show the same generic success state, whether or not the
      // email exists (docs/authentication.md §6) — no enumeration.
      await api.post('/auth/forgot-password', data);
      setSentTo(data.email);
      toast.show({
        tone: 'success',
        title: 'Check your inbox',
        description: 'If that email is registered, a reset link is on its way.',
      });
    } catch (err) {
      setServerError(applyServerErrors(err, setError, { fallback: 'We could not send the reset link. Please try again.' }));
    }
  };

  return (
    <Card className="p-8 shadow-elevated sm:p-10">
      {sentTo ? (
        <div className="animate-scale-in text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-[0_10px_30px_-8px_rgba(16,185,129,0.55)]">
            <MailCheck size={30} />
          </div>
          <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-navy">Check your email</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            If <span className="font-semibold text-navy">{sentTo}</span> belongs to a Schovexa account, we&apos;ve sent a
            link to reset your password. It expires soon, so use it right away.
          </p>
          <Alert variant="info" className="mt-5 text-left">
            Don&apos;t see it? Check your spam folder, or try again with a different address.
          </Alert>
          <Button variant="secondary" className="mt-5 w-full" onClick={() => setSentTo(null)}>
            Use a different email
          </Button>
        </div>
      ) : (
        <>
          <AuthCardHeader
            icon={<KeyRound size={24} />}
            title="Forgot your password?"
            description="No problem. Enter your email and we'll send you a secure link to set a new one."
          />
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-7 flex flex-col gap-4">
            {serverError && <Alert variant="error">{serverError}</Alert>}
            <TextField
              label="Email address"
              type="email"
              autoComplete="email"
              placeholder="you@yourschool.com"
              leftIcon={<Mail size={18} />}
              error={errors.email?.message}
              {...register('email')}
            />
            <Button type="submit" size="lg" loading={isSubmitting}>
              Send reset link
            </Button>
          </form>
        </>
      )}

      <p className="mt-7 text-center text-sm text-slate-500">
        <Link href="/login" className="inline-flex items-center gap-1.5 font-semibold text-brand-blue hover:underline">
          <ArrowLeft size={15} /> Back to log in
        </Link>
      </p>
    </Card>
  );
}
