'use client';

import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { updateSchoolSchema } from '@schovexa/validation';
import { Avatar, Button, SelectField, TextAreaField, TextField, useToast } from '@schovexa/ui';
import { Building2, CalendarDays, Clock, Coins, Globe, ImagePlus, Mail, MapPin, Phone, Trash2, Hash, Landmark, GraduationCap, BookMarked } from 'lucide-react';
import { CURRENT_SCHOOL_QUERY_KEY, type School } from '../../hooks/useCurrentSchool';
import { CURRENT_USER_QUERY_KEY } from '../../hooks/useCurrentUser';
import { API_URL, api, ApiError } from '../../lib/api-client';
import { COUNTRY_OPTIONS, countryName } from '../../lib/market';
import { SectionFrame, useSectionForm } from '../settings-frame';
import { SectionCard } from '../section-card';

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
const BOARDS = ['CBSE', 'ICSE / ISC', 'State board', 'IB', 'Cambridge (IGCSE)', 'Other'];
const TYPES = ['Pre-primary', 'Primary', 'Middle', 'Secondary', 'Senior secondary', 'K-12 (all grades)'];
const DESCRIPTION_MAX = 600;

function allTimeZones(): string[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone');
    if (supported?.length) return supported;
  } catch {
    /* older browser — use the short list */
  }
  return COMMON_ZONES;
}

// Saves part of the school record and refreshes everything that shows it.
function useSchoolSave() {
  const queryClient = useQueryClient();
  return async (data: Record<string, unknown>) => {
    await api.patch('/schools/me', data);
    await queryClient.invalidateQueries({ queryKey: CURRENT_SCHOOL_QUERY_KEY });
    await queryClient.invalidateQueries({ queryKey: CURRENT_USER_QUERY_KEY }); // the header shows the school's country
  };
}

export function ProfileTab({ school, canEdit }: { school: School; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <LogoCard school={school} canEdit={canEdit} />
      <ProfileCard school={school} canEdit={canEdit} />
      <ContactCard school={school} canEdit={canEdit} />
      <AddressCard school={school} canEdit={canEdit} />
      <RegionalCard school={school} canEdit={canEdit} />
    </div>
  );
}

function LogoCard({ school, canEdit }: { school: School; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: CURRENT_SCHOOL_QUERY_KEY });
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.postForm('/schools/me/logo', form);
      await refresh();
      toast.show({ tone: 'success', title: 'Logo updated' });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not upload the logo', description: err instanceof ApiError ? err.message : 'Please try again.' });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api.delete('/schools/me/logo');
      await refresh();
      toast.show({ tone: 'success', title: 'Logo removed' });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not remove the logo', description: err instanceof ApiError ? err.message : 'Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard icon={<ImagePlus size={18} />} title="School logo" description="Shown on your dashboard. A square PNG or JPEG under 1 MB works best.">
      <div className="flex flex-wrap items-center gap-5">
        {school.hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by the API with the session cookie, so next/image can't fetch it
          <img src={`${API_URL}/schools/me/logo?v=${encodeURIComponent(school.updatedAt)}`} alt={`${school.name} logo`} className="h-20 w-20 rounded-2xl border border-slate-200 bg-white object-contain p-1 shadow-card" />
        ) : (
          <Avatar name={school.name} tone="auto" size={80} />
        )}
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <input ref={input} type="file" accept="image/png,image/jpeg" className="sr-only" aria-label="Choose a logo file" onChange={(e) => upload(e.target.files?.[0])} />
            <Button type="button" variant="secondary" size="sm" loading={busy} onClick={() => input.current?.click()}>
              <ImagePlus size={15} /> {school.hasLogo ? 'Replace logo' : 'Upload logo'}
            </Button>
            {school.hasLogo && (
              <Button type="button" variant="soft-danger" size="sm" disabled={busy} onClick={remove}>
                <Trash2 size={15} /> Remove
              </Button>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function ProfileCard({ school, canEdit }: { school: School; canEdit: boolean }) {
  const save = useSchoolSave();
  const values = useMemo(
    () => ({
      name: school.name,
      motto: school.motto ?? '',
      description: school.description ?? '',
      schoolCode: school.schoolCode ?? '',
      board: school.board ?? '',
      schoolType: school.schoolType ?? '',
      establishedYear: school.establishedYear == null ? '' : String(school.establishedYear),
      affiliationNo: school.affiliationNo ?? '',
    }),
    [school],
  );
  const { form, onSubmit, serverError, saving } = useSectionForm({
    schema: updateSchoolSchema,
    values,
    save,
    // The year is typed as text; the API wants a number (or null to clear it).
    toApi: (v) => ({ ...v, establishedYear: v.establishedYear === '' ? null : Number(v.establishedYear) }),
    successTitle: 'Profile saved',
  });
  const { register, formState: { errors, isDirty }, reset, watch } = form;
  const length = (watch('description') ?? '').length;

  return (
    <SectionFrame icon={<Building2 size={18} />} title="School profile" description="How your school describes itself." canEdit={canEdit} dirty={isDirty} saving={saving} error={serverError} onSubmit={onSubmit} onDiscard={() => reset(values)}>
      <TextField label="School name" leftIcon={<Building2 size={16} />} error={errors.name?.message} {...register('name')} />
      <TextField label="Motto" leftIcon={<BookMarked size={16} />} placeholder="Learn, lead, serve" error={errors.motto?.message} {...register('motto')} />
      <div>
        <TextAreaField label="About the school" rows={3} placeholder="A few lines about your school" error={errors.description?.message} {...register('description')} />
        <p className={['mt-1 text-right text-xs tabular-nums', length > DESCRIPTION_MAX ? 'font-semibold text-red-600' : 'text-slate-400'].join(' ')}>{length} / {DESCRIPTION_MAX}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField label="Board / curriculum" leftIcon={<GraduationCap size={16} />} error={errors.board?.message} {...register('board')}>
          <option value="">Not set</option>
          {BOARDS.map((b) => <option key={b} value={b}>{b}</option>)}
        </SelectField>
        <SelectField label="School type" leftIcon={<Landmark size={16} />} error={errors.schoolType?.message} {...register('schoolType')}>
          <option value="">Not set</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </SelectField>
        <TextField label="School code" leftIcon={<Hash size={16} />} placeholder="Your internal or UDISE code" error={errors.schoolCode?.message} {...register('schoolCode')} />
        <TextField label="Affiliation number" leftIcon={<Hash size={16} />} error={errors.affiliationNo?.message} {...register('affiliationNo')} />
        <TextField label="Year established" type="number" inputMode="numeric" leftIcon={<CalendarDays size={16} />} placeholder="1998" error={errors.establishedYear?.message} {...register('establishedYear')} />
      </div>
    </SectionFrame>
  );
}

function ContactCard({ school, canEdit }: { school: School; canEdit: boolean }) {
  const save = useSchoolSave();
  const values = useMemo(
    () => ({ contactEmail: school.contactEmail ?? '', contactPhone: school.contactPhone ?? '', alternatePhone: school.alternatePhone ?? '', website: school.website ?? '' }),
    [school],
  );
  const { form, onSubmit, serverError, saving } = useSectionForm({ schema: updateSchoolSchema, values, save, successTitle: 'Contact details saved' });
  const { register, formState: { errors, isDirty }, reset } = form;
  return (
    <SectionFrame icon={<Mail size={18} />} title="Contact information" description="Where parents and visitors can reach you." canEdit={canEdit} dirty={isDirty} saving={saving} error={serverError} onSubmit={onSubmit} onDiscard={() => reset(values)}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Contact email" type="email" leftIcon={<Mail size={16} />} placeholder="office@school.org" error={errors.contactEmail?.message} {...register('contactEmail')} />
        <TextField label="Contact phone" leftIcon={<Phone size={16} />} placeholder="+91 98765 43210" error={errors.contactPhone?.message} {...register('contactPhone')} />
        <TextField label="Alternate phone" leftIcon={<Phone size={16} />} placeholder="Front desk or principal’s office" error={errors.alternatePhone?.message} {...register('alternatePhone')} />
        <TextField label="Website" leftIcon={<Globe size={16} />} placeholder="https://www.school.org" helperText="Include https://" error={errors.website?.message} {...register('website')} />
      </div>
    </SectionFrame>
  );
}

function AddressCard({ school, canEdit }: { school: School; canEdit: boolean }) {
  const save = useSchoolSave();
  const values = useMemo(
    () => ({ address: school.address ?? '', city: school.city ?? '', state: school.state ?? '', postalCode: school.postalCode ?? '', country: school.country }),
    [school],
  );
  const { form, onSubmit, serverError, saving } = useSectionForm({ schema: updateSchoolSchema, values, save, successTitle: 'Address saved' });
  const { register, formState: { errors, isDirty }, reset } = form;
  const countryOptions = useMemo(() => {
    const codes = COUNTRY_OPTIONS.includes(school.country) ? COUNTRY_OPTIONS : [school.country, ...COUNTRY_OPTIONS];
    return codes.map((code) => [code, countryName(code)] as const).sort((a, b) => a[1].localeCompare(b[1]));
  }, [school.country]);
  return (
    <SectionFrame icon={<MapPin size={18} />} title="Address" description="Your school’s postal address." canEdit={canEdit} dirty={isDirty} saving={saving} error={serverError} onSubmit={onSubmit} onDiscard={() => reset(values)}>
      <TextField label="Street address" leftIcon={<MapPin size={16} />} placeholder="Building, street, area" error={errors.address?.message} {...register('address')} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="City" error={errors.city?.message} {...register('city')} />
        <TextField label="State / region" error={errors.state?.message} {...register('state')} />
        <TextField label="PIN / postal code" error={errors.postalCode?.message} {...register('postalCode')} />
        <SelectField label="Country" leftIcon={<Globe size={16} />} helperText="Shown in the header for everyone at your school." error={errors.country?.message} {...register('country')}>
          {countryOptions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </SelectField>
      </div>
    </SectionFrame>
  );
}

function RegionalCard({ school, canEdit }: { school: School; canEdit: boolean }) {
  const save = useSchoolSave();
  const values = useMemo(() => ({ timezone: school.timezone, currency: school.currency, dateFormat: school.dateFormat }), [school]);
  const { form, onSubmit, serverError, saving } = useSectionForm({ schema: updateSchoolSchema, values, save, successTitle: 'Regional settings saved' });
  const { register, formState: { errors, isDirty }, reset } = form;
  const zones = useMemo(() => {
    const all = allTimeZones();
    const rest = all.filter((z) => !COMMON_ZONES.includes(z));
    if (school.timezone && !all.includes(school.timezone) && !COMMON_ZONES.includes(school.timezone)) rest.unshift(school.timezone);
    return { common: COMMON_ZONES, rest };
  }, [school.timezone]);
  return (
    <SectionFrame icon={<Clock size={18} />} title="Regional settings" description="Time zone, currency and how dates are shown." canEdit={canEdit} dirty={isDirty} saving={saving} error={serverError} onSubmit={onSubmit} onDiscard={() => reset(values)}>
      <SelectField label="Time zone" leftIcon={<Clock size={16} />} helperText="Decides when “today” starts and ends for your school — attendance locks at midnight in this zone." error={errors.timezone?.message} {...register('timezone')}>
        <optgroup label="Common">
          {zones.common.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
        </optgroup>
        <optgroup label="All time zones">
          {zones.rest.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
        </optgroup>
      </SelectField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField label="Currency" leftIcon={<Coins size={16} />} error={errors.currency?.message} {...register('currency')}>
          {CURRENCIES.map(([code, label]) => <option key={code} value={code}>{code} — {label}</option>)}
        </SelectField>
        <SelectField label="Date format" leftIcon={<CalendarDays size={16} />} error={errors.dateFormat?.message} {...register('dateFormat')}>
          {DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
        </SelectField>
      </div>
    </SectionFrame>
  );
}
