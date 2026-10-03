'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { changePasswordSchema, updateProfileSchema, type ChangePasswordInput, type UpdateProfileInput } from '@schovexa/validation';
import { Alert, Badge, Button, SelectField, Skeleton, StatCard, Tabs, TextAreaField, TextField, useToast } from '@schovexa/ui';
import { Bell, CalendarDays, FileText, KeyRound, Lock, Mail, MapPin, Phone, Save, School, ShieldCheck, Undo2, User, UserRound, HeartPulse, CalendarCheck } from 'lucide-react';
import { SESSIONS_QUERY_KEY, SECURITY_ACTIVITY_QUERY_KEY } from '../../../../hooks/useSecurity';
import { MY_PROFILE_QUERY_KEY, useMyProfile, type PersonProfile } from '../../../../hooks/useProfile';
import { CURRENT_USER_QUERY_KEY } from '../../../../hooks/useCurrentUser';
import { api, ApiError } from '../../../../lib/api-client';
import { applyServerErrors } from '../../../../lib/forms';
import { ProfileHero } from '../../../../components/profile-hero';
import { OwnPhoto } from '../../../../components/own-photo';
import { SectionCard } from '../../../../components/section-card';
import { ToggleRow } from '../../../../components/settings-frame';
import { PersonDocumentsPanel } from '../../../../components/person-documents-panel';
import { DevicesPanel, SecurityActivityPanel } from '../../../../components/security-devices';

type TabId = 'details' | 'documents' | 'security';

const GENDER_LABELS = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' } as const;
const BIO_MAX = 500;

export default function MyProfilePage() {
  const { data: profile, isLoading, isError, refetch } = useMyProfile();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>('details');

  if (isError) {
    return (
      <div className="mx-auto max-w-3xl">
        <Alert variant="error">We couldn’t load your profile. Please refresh and try again.</Alert>
      </div>
    );
  }

  if (isLoading || !profile) {
    return (
      <div className="mx-auto max-w-5xl space-y-6" role="status" aria-label="Loading your profile">
        <Skeleton className="h-44 w-full rounded-3xl" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  const { user } = profile;
  const fullName = `${user.firstName} ${user.lastName}`;
  const complete = completeness(profile);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ProfileHero
        backHref="/dashboard"
        backLabel="Back to dashboard"
        name={fullName}
        subtitle={profile.school.name}
        avatar={<OwnPhoto name={fullName} photoUrl={user.photoUrl} />}
        badges={
          <>
            <Badge tone="brand" className="!bg-white/15 !text-white !ring-white/25">{profile.role.name}</Badge>
            <Badge tone="success" dot className="!bg-white/15 !text-white !ring-white/25">Active</Badge>
          </>
        }
        chips={[
          { icon: <Mail size={13} />, label: user.email },
          ...(user.phone ? [{ icon: <Phone size={13} />, label: user.phone }] : []),
          { icon: <School size={13} />, label: profile.school.name },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Profile complete" tone="brand" icon={<UserRound size={18} />} value={`${complete}%`} hint={complete === 100 ? 'All set' : 'Add the missing details'} />
        <StatCard label="Member since" tone="blue" icon={<CalendarCheck size={18} />} value={new Date(profile.joinedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} hint={profile.role.name} />
        <StatCard label="Documents" tone="violet" icon={<FileText size={18} />} value={profile.documentCount} hint="PDF, JPEG or PNG" />
      </div>

      <Tabs
        value={tab}
        onChange={(id) => setTab(id as TabId)}
        tabs={[
          { id: 'details', label: 'Personal details', icon: <User size={16} /> },
          { id: 'documents', label: 'Documents', icon: <FileText size={16} />, count: profile.documentCount || undefined },
          { id: 'security', label: 'Security', icon: <ShieldCheck size={16} /> },
        ]}
      />

      <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'details' && <DetailsForm profile={profile} />}
        {tab === 'documents' && (
          <PersonDocumentsPanel
            basePath="/me/documents"
            canUpload
            canDelete
            description="Upload your ID proof, certificates or contract. Only you and school administrators can see these."
            onChanged={() => queryClient.invalidateQueries({ queryKey: MY_PROFILE_QUERY_KEY }).then(() => refetch())}
          />
        )}
        {tab === 'security' && <SecurityPanel />}
      </div>
    </div>
  );
}

// How much of the optional profile is filled in — a gentle nudge, not a gate.
function completeness(profile: PersonProfile): number {
  const u = profile.user;
  const fields = [u.phone, u.dateOfBirth, u.gender, u.address, u.emergencyContactName, u.emergencyContactPhone, u.bio];
  const filled = fields.filter((f) => !!f).length + (profile.documentCount > 0 ? 1 : 0);
  return Math.round((filled / (fields.length + 1)) * 100);
}

function DetailsForm({ profile }: { profile: PersonProfile }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const u = profile.user;

  const initial = useMemo<UpdateProfileInput>(
    () => ({
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone ?? '',
      dateOfBirth: u.dateOfBirth ?? '',
      gender: u.gender ?? '',
      address: u.address ?? '',
      emergencyContactName: u.emergencyContactName ?? '',
      emergencyContactPhone: u.emergencyContactPhone ?? '',
      bio: u.bio ?? '',
      notifyByEmail: u.notifyByEmail,
      notifyInApp: u.notifyInApp,
    }),
    [u],
  );

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateProfileInput>({ resolver: zodResolver(updateProfileSchema), mode: 'onTouched', values: initial });
  const bioLength = (watch('bio') ?? '').length;

  const onSubmit = async (data: UpdateProfileInput) => {
    setServerError(null);
    try {
      await api.patch('/me/profile', data);
      await queryClient.invalidateQueries({ queryKey: MY_PROFILE_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: CURRENT_USER_QUERY_KEY }); // the header greets you by first name
      toast.show({ tone: 'success', title: 'Profile saved', description: 'Your details are up to date.' });
    } catch (err) {
      setServerError(applyServerErrors(err, setError, { fallback: 'We could not save your profile. Please try again.' }));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      {serverError && <Alert variant="error">{serverError}</Alert>}

      <SectionCard icon={<User size={18} />} title="About you" description="Your name and how people can reach you.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="First name" leftIcon={<User size={16} />} autoComplete="given-name" error={errors.firstName?.message} {...register('firstName')} />
          <TextField label="Last name" leftIcon={<User size={16} />} autoComplete="family-name" error={errors.lastName?.message} {...register('lastName')} />
          <TextField label="Email" leftIcon={<Mail size={16} />} value={u.email} readOnly disabled helperText="Your email is your login, so it can’t be changed here." />
          <TextField label="Phone number" type="tel" leftIcon={<Phone size={16} />} autoComplete="tel" placeholder="+91 98765 43210" error={errors.phone?.message} {...register('phone')} />
          <TextField label="Date of birth" type="date" leftIcon={<CalendarDays size={16} />} autoComplete="bday" error={errors.dateOfBirth?.message} {...register('dateOfBirth')} />
          <SelectField label="Gender" leftIcon={<UserRound size={16} />} error={errors.gender?.message} {...register('gender')}>
            <option value="">Prefer not to say</option>
            {Object.entries(GENDER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </SelectField>
        </div>
        <div className="mt-4">
          <TextAreaField label="Address" rows={3} placeholder="House, street, city, PIN" error={errors.address?.message} {...register('address')} />
        </div>
        <div className="mt-4">
          <TextAreaField label="About me" rows={4} placeholder="A few words about your experience and interests" error={errors.bio?.message} {...register('bio')} />
          <p className={['mt-1 text-right text-xs tabular-nums', bioLength > BIO_MAX ? 'font-semibold text-red-600' : 'text-slate-400'].join(' ')}>
            {bioLength} / {BIO_MAX}
          </p>
        </div>
      </SectionCard>

      <SectionCard icon={<HeartPulse size={18} />} title="Emergency contact" description="Who the school should call if something happens.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Contact name" leftIcon={<User size={16} />} placeholder="Name of a relative or friend" error={errors.emergencyContactName?.message} {...register('emergencyContactName')} />
          <TextField label="Contact phone" type="tel" leftIcon={<Phone size={16} />} placeholder="+91 90000 11111" error={errors.emergencyContactPhone?.message} {...register('emergencyContactPhone')} />
        </div>
      </SectionCard>

      <SectionCard icon={<Bell size={18} />} title="Notifications" description="Choose which messages reach you. Security emails — a new sign-in, a password reset — are always sent.">
        <div className="flex flex-col gap-3">
          <ToggleRow title="In-app notifications" description="Notices and updates in the bell at the top of the page — approvals, reminders and decisions." {...register('notifyInApp')} />
          <ToggleRow title="Email notifications" description="The same updates by email, where the school’s mail is set up." {...register('notifyByEmail')} />
        </div>
      </SectionCard>

      <div className="sticky bottom-4 z-10 flex flex-col items-stretch justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-elevated backdrop-blur sm:flex-row sm:items-center">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          {isDirty ? (
            <Badge tone="warning" dot pulse>Unsaved changes</Badge>
          ) : (
            <>
              <MapPin size={15} className="text-slate-400" /> Everything is saved.
            </>
          )}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={!isDirty || isSubmitting} onClick={() => reset(initial)}>
            <Undo2 size={16} /> Discard
          </Button>
          <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
            <Save size={16} /> Save changes
          </Button>
        </div>
      </div>
    </form>
  );
}

function SecurityPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    mode: 'onTouched',
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  const onSubmit = async (data: ChangePasswordInput) => {
    setServerError(null);
    if (data.newPassword !== confirm) {
      setConfirmError('The two passwords do not match.');
      return;
    }
    setConfirmError(null);
    try {
      await api.post('/auth/change-password', data);
      reset();
      setConfirm('');
      toast.show({ tone: 'success', title: 'Password updated', description: 'You’re still signed in here; other devices were signed out.' });
      queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: SECURITY_ACTIVITY_QUERY_KEY });
    } catch (err) {
      setServerError(applyServerErrors(err, setError, { fallback: 'We could not change your password. Please try again.' }));
    }
  };

  return (
    <div className="flex flex-col gap-6">
    <DevicesPanel />
    <SectionCard icon={<KeyRound size={18} />} title="Change password" description="Choose a strong password you don’t use anywhere else.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex max-w-md flex-col gap-4">
        {serverError && <Alert variant="error">{serverError}</Alert>}
        <TextField label="Current password" type="password" autoComplete="current-password" leftIcon={<Lock size={16} />} error={errors.currentPassword?.message} {...register('currentPassword')} />
        <TextField label="New password" type="password" autoComplete="new-password" leftIcon={<Lock size={16} />} helperText="At least 10 characters." error={errors.newPassword?.message} {...register('newPassword')} />
        <TextField
          label="Confirm new password"
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          leftIcon={<Lock size={16} />}
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setConfirmError(null);
          }}
          error={confirmError ?? undefined}
        />
        <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-500" />
          Changing your password signs you out everywhere else, so a lost or shared device can’t keep using your account.
        </p>
        <div>
          <Button type="submit" loading={isSubmitting}>
            <KeyRound size={16} /> Update password
          </Button>
        </div>
      </form>
    </SectionCard>
    <SecurityActivityPanel />
    </div>
  );
}
