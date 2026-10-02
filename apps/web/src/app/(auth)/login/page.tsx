'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginFormSchema, type LoginFormInput, type LoginFormOutput } from '@schovexa/validation';
import { Button, Card, TextField, Alert, useToast } from '@schovexa/ui';
import { ArrowRight, LogIn, Lock, Mail } from 'lucide-react';
import { api } from '../../../lib/api-client';
import { applyServerErrors } from '../../../lib/forms';
import { AuthCardHeader } from '../../../components/auth-card-header';
import type { CurrentUser } from '@schovexa/types';

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormInput, unknown, LoginFormOutput>({
    resolver: zodResolver(loginFormSchema),
    mode: 'onTouched',
    defaultValues: { email: '', password: '', rememberMe: false },
  });

  const onSubmit = async (data: LoginFormOutput) => {
    setServerError(null);
    try {
      await api.post('/auth/login', data);
      const me = await api.get<CurrentUser>('/auth/me');

      if (me.memberships.length === 0) {
        setServerError('This account has no school access yet. Ask your school administrator to invite you.');
        return;
      }
      toast.show({ tone: 'success', title: `Welcome back, ${me.firstName}!`, description: 'Taking you to your dashboard…' });
      if (me.memberships.length === 1) {
        await api.post('/auth/select-school', { membershipId: me.memberships[0].membershipId });
        router.push('/dashboard');
        return;
      }
      router.push('/select-school');
    } catch (err) {
      setServerError(applyServerErrors(err, setError, { fallback: 'We could not log you in. Please try again.' }));
    }
  };

  return (
    <Card className="p-8 shadow-elevated sm:p-10">
      <AuthCardHeader
        icon={<LogIn size={24} />}
        title="Welcome back"
        description="Log in to manage attendance, fees, notices and everything in between."
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
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          leftIcon={<Lock size={18} />}
          error={errors.password?.message}
          {...register('password')}
        />

        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue/30" {...register('rememberMe')} />
            Keep me signed in
          </label>
          <Link href="/forgot-password" className="text-sm font-semibold text-brand-blue hover:underline">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" size="lg" loading={isSubmitting}>
          Log in <ArrowRight size={18} />
        </Button>
        <p className="text-center text-xs text-slate-400">
          Teachers, staff and parents don’t sign up here — your school sends you an invitation.
        </p>
      </form>

      <p className="mt-7 text-center text-sm text-slate-500">
        New to Schovexa?{' '}
        <Link href="/register" className="font-semibold text-brand-blue hover:underline">
          Register your school
        </Link>
      </p>
    </Card>
  );
}
