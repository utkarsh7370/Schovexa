'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchoolFormSchema, type RegisterSchoolFormInput, type RegisterSchoolFormOutput } from '@schovexa/validation';
import { Button, Card, TextField, Alert, PasswordStrength, useToast } from '@schovexa/ui';
import { ArrowRight, Building2, Lock, Mail, School, ShieldCheck, User } from 'lucide-react';
import { api } from '../../../lib/api-client';
import { applyServerErrors } from '../../../lib/forms';
import { AuthCardHeader } from '../../../components/auth-card-header';
import { useMarket } from '../../../components/market-provider';

export default function RegisterSchoolPage() {
  const router = useRouter();
  const toast = useToast();
  // Where the visitor is becomes the school's country (editable later in settings).
  const { country } = useMarket();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting, touchedFields },
  } = useForm<RegisterSchoolFormInput, unknown, RegisterSchoolFormOutput>({
    resolver: zodResolver(registerSchoolFormSchema),
    mode: 'onTouched',
    defaultValues: {
      schoolName: '',
      directorFirstName: '',
      directorLastName: '',
      email: '',
      password: '',
      confirmPassword: '',
      acceptTerms: false,
    },
  });
  const password = watch('password');
  const confirmPassword = watch('confirmPassword');
  // The schema can only check "passwords match" once every other field is
  // valid, so mirror it live here — the mismatch shows as soon as the
  // confirm field has been touched.
  const confirmError =
    errors.confirmPassword?.message ??
    (touchedFields.confirmPassword && confirmPassword && confirmPassword !== password ? 'Passwords do not match' : undefined);

  const onSubmit = async (data: RegisterSchoolFormOutput) => {
    setServerError(null);
    try {
      // Registration auto-logs in AND auto-selects the new school
      // server-side (docs/api.md §7) — straight to the dashboard. Only
      // the fields the API knows about are sent (no confirm/terms).
      await api.post('/schools/register', {
        schoolName: data.schoolName,
        directorFirstName: data.directorFirstName,
        directorLastName: data.directorLastName,
        email: data.email,
        password: data.password,
        ...(country ? { country } : {}),
      });
      toast.show({
        tone: 'success',
        title: 'Your school is ready!',
        description: `${data.schoolName} has been created. Let's set it up.`,
      });
      router.push('/dashboard');
    } catch (err) {
      setServerError(
        applyServerErrors(err, setError, {
          conflictField: 'email',
          conflictMessage: 'An account with this email already exists. Try logging in instead.',
          fallback: 'We could not create your school. Please try again.',
        }),
      );
    }
  };

  return (
    <Card className="p-8 shadow-elevated sm:p-10">
      <AuthCardHeader
        icon={<School size={24} />}
        title="Register your school"
        description="Create your school's workspace and your director account in one step. It takes about a minute."
      />
      <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
        Only school owners register here. Teachers, staff, students and parents never create their own account — your school adds them and sends each person an invitation.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-7 flex flex-col gap-4">
        {serverError && <Alert variant="error">{serverError}</Alert>}

        <TextField
          label="School name"
          placeholder="Sunrise Public School"
          leftIcon={<Building2 size={18} />}
          autoComplete="organization"
          error={errors.schoolName?.message}
          {...register('schoolName')}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="First name"
            placeholder="Asha"
            leftIcon={<User size={18} />}
            autoComplete="given-name"
            error={errors.directorFirstName?.message}
            {...register('directorFirstName')}
          />
          <TextField
            label="Last name"
            placeholder="Rao"
            leftIcon={<User size={18} />}
            autoComplete="family-name"
            error={errors.directorLastName?.message}
            {...register('directorLastName')}
          />
        </div>

        <TextField
          label="Work email"
          type="email"
          autoComplete="email"
          placeholder="director@yourschool.com"
          leftIcon={<Mail size={18} />}
          error={errors.email?.message}
          {...register('email')}
        />

        <TextField
          label="Password"
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

        <div>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-600">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-brand-blue"
              {...register('acceptTerms')}
            />
            <span>
              I agree to the{' '}
              <Link href="/terms-of-service" target="_blank" className="font-semibold text-brand-blue hover:underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy-policy" target="_blank" className="font-semibold text-brand-blue hover:underline">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {errors.acceptTerms && (
            <p role="alert" className="mt-1.5 animate-fade-in pl-7 text-sm font-medium text-red-600">
              {errors.acceptTerms.message}
            </p>
          )}
        </div>

        <Button type="submit" size="lg" loading={isSubmitting} className="mt-1">
          Create my school <ArrowRight size={18} />
        </Button>
      </form>

      <p className="mt-7 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-brand-blue hover:underline">
          Log in
        </Link>
      </p>
    </Card>
  );
}
