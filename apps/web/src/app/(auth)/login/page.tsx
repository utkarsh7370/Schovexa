'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@schovexa/validation';
import { Button, Card, TextField, Alert } from '@schovexa/ui';
import { api, ApiError } from '../../../lib/api-client';
import type { CurrentUser } from '@schovexa/types';

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginInput) => {
    setServerError(null);
    try {
      await api.post('/auth/login', data);
      const me = await api.get<CurrentUser>('/auth/me');

      if (me.memberships.length === 0) {
        setServerError('This account has no school access yet.');
        return;
      }
      if (me.memberships.length === 1) {
        await api.post('/auth/select-school', { membershipId: me.memberships[0].membershipId });
        router.push('/dashboard');
        return;
      }
      router.push('/select-school');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <Card className="p-8">
      <h1 className="text-xl font-bold text-navy">Log in</h1>
      <p className="mt-1 text-sm text-slate-500">Welcome back — enter your details to continue.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4">
        {serverError && <Alert variant="error">{serverError}</Alert>}

        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm font-medium text-brand-blue hover:underline">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" loading={isSubmitting} className="mt-2">
          Log in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        New school?{' '}
        <Link href="/register" className="font-medium text-brand-blue hover:underline">
          Register your school
        </Link>
      </p>
    </Card>
  );
}
