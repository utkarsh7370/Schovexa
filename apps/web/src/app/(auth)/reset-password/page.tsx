'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { setPasswordFormSchema, type SetPasswordFormInput } from '@schovexa/validation';
import { Button, Card, TextField, Alert, Spinner, PasswordStrength, useToast } from '@schovexa/ui';
import { ArrowLeft, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { api } from '../../../lib/api-client';
import { applyServerErrors } from '../../../lib/forms';
import { AuthCardHeader } from '../../../components/auth-card-header';

function ResetPasswordForm() {
  const router = useRouter();
  const toast = useToast();
  const token = useSearchParams().get('token');
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting, touchedFields },
  } = useForm<SetPasswordFormInput, unknown, SetPasswordFormInput>({
    resolver: zodResolver(setPasswordFormSchema),
    mode: 'onTouched',
    defaultValues: { password: '', confirmPassword: '' },
  });
  const password = watch('password');
  const confirmPassword = watch('confirmPassword');
  // The schema can only check "passwords match" once every other field is
  // valid, so mirror it live here — the mismatch shows as soon as the
  // confirm field has been touched.
  const confirmError =
    errors.confirmPassword?.message ??
    (touchedFields.confirmPassword && confirmPassword && confirmPassword !== password ? 'Passwords do not match' : undefined);

  const onSubmit = async (data: SetPasswordFormInput) => {
    if (!token) {
      setServerError('This reset link is missing its token. Please open the link from your email again.');
      return;
    }
    setServerError(null);
    try {
      await api.post('/auth/reset-password', { token, password: data.password });
      toast.show({
        tone: 'success',
        title: 'Password updated',
        description: 'You can now log in with your new password.',
      });
      router.push('/login');
    } catch (err) {
      setServerError(
        applyServerErrors(err, setError, {
          fallback: 'This reset link is invalid or has expired. Please request a new one.',
        }),
      );
    }
  };

  return (
    <Card className="p-8 shadow-elevated sm:p-10">
      <AuthCardHeader
        icon={<KeyRound size={24} />}
        title="Set a new password"
        description="Choose a strong password you have not used anywhere else."
      />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-7 flex flex-col gap-4">
        {serverError && <Alert variant="error">{serverError}</Alert>}
        {!token && <Alert variant="warning">No reset token found in this link. Open the link from your email again.</Alert>}

        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          placeholder="Create a strong password"
          leftIcon={<Lock size={18} />}
          error={errors.password?.message}
          {...register('password')}
        />
        <PasswordStrength password={password ?? ''} />

        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="Type your password again"
          leftIcon={<ShieldCheck size={18} />}
          error={confirmError}
          {...register('confirmPassword')}
        />

        <Button type="submit" size="lg" loading={isSubmitting} disabled={!token}>
          Update password
        </Button>
      </form>

      <p className="mt-7 text-center text-sm text-slate-500">
        <Link href="/login" className="inline-flex items-center gap-1.5 font-semibold text-brand-blue hover:underline">
          <ArrowLeft size={15} /> Back to log in
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
