'use client';

import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { updateSchoolSchema, type UpdateSchoolInput } from '@schovexa/validation';
import { Alert, Avatar, Badge, Button, PageHeader, SelectField, Skeleton, TextField, useToast } from '@schovexa/ui';
import { Building2, Clock, Coins, Globe, Hourglass, Lock, LogIn, LogOut, Mail, MapPin, Phone, Save, Timer, Undo2, CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { useCurrentSchool, CURRENT_SCHOOL_QUERY_KEY, type School } from '../../../../hooks/useCurrentSchool';
import { CURRENT_USER_QUERY_KEY } from '../../../../hooks/useCurrentUser';
import { useCan } from '../../../../hooks/useCan';
import { COUNTRY_OPTIONS, countryName } from '../../../../lib/market';
import { api, ApiError } from '../../../../lib/api-client';

const COMMON_ZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Australia/Sydney'];
const CURRENCIES: [string, string][] = [
  ['INR', '₹ Indian rupee'],
  ['USD', '$ US dollar'],
  ['GBP', '£ British pound'],
  ['EUR', '€ Euro'],
  ['AED', 'د.إ UAE dirham'],
  ['SGD', 'S$ Singapore dollar'],
  ['AUD', 'A$ Australian dollar'],
];
const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];

function allTimeZones(): string[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone');
    if (supported?.length) return supported;
  } catch {
    /* older browser — use the short list */
  }
  return COMMON_ZONES;
}

function SettingsSection({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand-blue ring-1 ring-inset ring-brand-blue/15">{icon}</span>
        <div>
          <h2 className="text-base font-bold text-navy">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </header>
      <div className="mt-5 flex flex-col gap-4">{children}</div>
    </section>
  );
}

export default function SchoolSettingsPage() {
  const { data: school, isError } = useCurrentSchool();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Administration" title="School Settings" description="Your school’s profile, contact details and regional settings." />
      {isError && (
        <Alert variant="error" className="mt-6">
          We couldn’t load your school’s settings. Please refresh and try again.
        </Alert>
      )}
      {!school && !isError && (
        <div className="mt-6 flex flex-col gap-4">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      )}
      {school && <SettingsForm school={school} />}
    </div>
  );
}

function SettingsForm({ school }: { school: School }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { can } = useCan();
  const canEdit = can('school.update');
  const [serverError, setServerError] = useState<string | null>(null);

  const initial = useMemo<UpdateSchoolInput>(
    () => ({
      name: school.name,
      address: school.address ?? '',
      contactEmail: school.contactEmail ?? '',
      contactPhone: school.contactPhone ?? '',
      website: school.website ?? '',
      timezone: school.timezone,
      country: school.country,
      currency: school.currency,
      dateFormat: school.dateFormat,
      staffPunchInTime: school.staffPunchInTime,
      staffPunchOutTime: school.staffPunchOutTime,
      staffLateGraceMinutes: school.staffLateGraceMinutes,
    }),
    [school],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateSchoolInput>({ resolver: zodResolver(updateSchoolSchema), mode: 'onTouched', values: initial });

  const zones = useMemo(() => {
    const all = allTimeZones();
    const rest = all.filter((z) => !COMMON_ZONES.includes(z));
    // Keep a saved zone that this browser's list doesn't know selectable.
    if (school.timezone && !all.includes(school.timezone) && !COMMON_ZONES.includes(school.timezone)) rest.unshift(school.timezone);
    return { common: COMMON_ZONES, rest };
  }, [school.timezone]);

  const countryOptions = useMemo(() => {
    const codes = COUNTRY_OPTIONS.includes(school.country) ? COUNTRY_OPTIONS : [school.country, ...COUNTRY_OPTIONS];
    return codes.map((code) => [code, countryName(code)] as const).sort((a, b) => a[1].localeCompare(b[1]));
  }, [school.country]);

  const onSubmit = async (data: UpdateSchoolInput) => {
    setServerError(null);
    try {
      await api.patch('/schools/me', data);
      await queryClient.invalidateQueries({ queryKey: CURRENT_SCHOOL_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: CURRENT_USER_QUERY_KEY }); // header shows the school's country
      toast.show({ tone: 'success', title: 'Settings saved', description: 'Your school’s details are up to date.' });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not save changes.');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 flex flex-col gap-6">
      <div className="relative overflow-hidden rounded-3xl bg-brand-gradient-dark p-6 text-white shadow-elevated sm:p-7">
        <div className="bg-grid-light pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 animate-blob rounded-full bg-brand-electric/30 blur-3xl" aria-hidden="true" />
        <div className="relative flex items-center gap-4">
          <Avatar name={school.name} tone="auto" size={64} ring />
          <div className="min-w-0">
            <p className="truncate text-xl font-extrabold tracking-tight">{school.name}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/70">
              <span className="inline-flex items-center gap-1.5"><Clock size={14} /> {school.timezone}</span>
              <span className="inline-flex items-center gap-1.5"><Coins size={14} /> {school.currency}</span>
            </p>
          </div>
        </div>
      </div>

      {!canEdit && (
        <Alert variant="info">
          <span className="inline-flex items-center gap-2"><Lock size={15} /> You can view these settings, but your role can’t change them.</span>
        </Alert>
      )}
      {serverError && <Alert variant="error">{serverError}</Alert>}

      <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-6 disabled:opacity-90">
        <SettingsSection icon={<Building2 size={18} />} title="School profile" description="How your school appears across Schovexa.">
          <TextField label="School name" leftIcon={<Building2 size={16} />} error={errors.name?.message} {...register('name')} />
          <TextField label="Address" leftIcon={<MapPin size={16} />} placeholder="Street, city, postcode" error={errors.address?.message} {...register('address')} />
        </SettingsSection>

        <SettingsSection icon={<Mail size={18} />} title="Contact details" description="Where parents and visitors can reach you.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="Contact email" type="email" leftIcon={<Mail size={16} />} placeholder="office@school.org" error={errors.contactEmail?.message} {...register('contactEmail')} />
            <TextField label="Contact phone" leftIcon={<Phone size={16} />} placeholder="+91 98765 43210" error={errors.contactPhone?.message} {...register('contactPhone')} />
          </div>
          <TextField label="Website" leftIcon={<Globe size={16} />} placeholder="https://www.school.org" helperText="Include https://" error={errors.website?.message} {...register('website')} />
        </SettingsSection>

        <SettingsSection icon={<Clock size={18} />} title="Regional settings" description="Time zone, currency and how dates are shown.">
          <SelectField
            label="Time zone"
            leftIcon={<Clock size={16} />}
            helperText="Decides when “today” starts and ends for your school — attendance locks at midnight in this zone."
            error={errors.timezone?.message}
            {...register('timezone')}
          >
            <optgroup label="Common">
              {zones.common.map((z) => (
                <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>
              ))}
            </optgroup>
            <optgroup label="All time zones">
              {zones.rest.map((z) => (
                <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>
              ))}
            </optgroup>
          </SelectField>
          <SelectField
            label="Country"
            leftIcon={<Globe size={16} />}
            helperText="Shown in the header for everyone at your school."
            error={errors.country?.message}
            {...register('country')}
          >
            {countryOptions.map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </SelectField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField label="Currency" leftIcon={<Coins size={16} />} error={errors.currency?.message} {...register('currency')}>
              {CURRENCIES.map(([code, label]) => (
                <option key={code} value={code}>{code} — {label}</option>
              ))}
            </SelectField>
            <SelectField label="Date format" leftIcon={<CalendarDays size={16} />} error={errors.dateFormat?.message} {...register('dateFormat')}>
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </SelectField>
          </div>
        </SettingsSection>

        <SettingsSection icon={<Timer size={18} />} title="Staff working hours" description="When teachers and staff are expected to punch in and out. Used to flag late arrivals and early departures.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TextField label="Punch-in time" type="time" leftIcon={<LogIn size={16} />} error={errors.staffPunchInTime?.message} {...register('staffPunchInTime')} />
            <TextField label="Punch-out time" type="time" leftIcon={<LogOut size={16} />} error={errors.staffPunchOutTime?.message} {...register('staffPunchOutTime')} />
            <TextField
              label="Grace period (minutes)"
              type="number"
              min={0}
              max={120}
              leftIcon={<Hourglass size={16} />}
              helperText="Punching in this long after the start time is still on time."
              error={errors.staffLateGraceMinutes?.message}
              {...register('staffLateGraceMinutes')}
            />
          </div>
          <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            <Clock size={14} className="mt-0.5 shrink-0 text-slate-400" />
            Times are in your school’s time zone ({school.timezone.replace(/_/g, ' ')}). Staff who punch in after the grace period are marked late.
          </p>
        </SettingsSection>
      </fieldset>

      {canEdit && (
        <div className="sticky bottom-4 z-10 flex flex-col items-stretch justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-elevated backdrop-blur sm:flex-row sm:items-center">
          <p className="flex items-center gap-2 text-sm text-slate-500">
            {isDirty ? (
              <Badge tone="warning" dot pulse>
                Unsaved changes
              </Badge>
            ) : (
              'All changes saved'
            )}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={!isDirty || isSubmitting} onClick={() => reset(initial)}>
              <Undo2 size={15} /> Discard
            </Button>
            <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
              <Save size={16} /> Save changes
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
