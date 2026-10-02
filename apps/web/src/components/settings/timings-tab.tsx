'use client';

import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { updateSchoolSchema, updateSchoolSettingsSchema, WEEKDAY_LABELS } from '@schovexa/validation';
import { TextField } from '@schovexa/ui';
import { CalendarDays, Clock, Coffee, Hourglass, LogIn, LogOut, Sun, Timer } from 'lucide-react';
import { CURRENT_SCHOOL_QUERY_KEY, type School } from '../../hooks/useCurrentSchool';
import { SCHOOL_SETTINGS_QUERY_KEY, type SchoolSettings } from '../../hooks/useSchoolSettings';
import { api } from '../../lib/api-client';
import { SectionFrame, ToggleRow, useSectionForm } from '../settings-frame';

const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

export function useSettingsSave() {
  const queryClient = useQueryClient();
  return async (data: Record<string, unknown>) => {
    await api.patch('/school-settings', data);
    await queryClient.invalidateQueries({ queryKey: SCHOOL_SETTINGS_QUERY_KEY });
  };
}

export function TimingsTab({ school, settings, canEdit }: { school: School; settings: SchoolSettings; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <SchoolTimingsCard settings={settings} canEdit={canEdit} timezone={school.timezone} />
      <WorkingDaysCard settings={settings} canEdit={canEdit} />
      <StaffHoursCard school={school} canEdit={canEdit} />
    </div>
  );
}

function SchoolTimingsCard({ settings, canEdit, timezone }: { settings: SchoolSettings; canEdit: boolean; timezone: string }) {
  const save = useSettingsSave();
  const values = useMemo(
    () => ({
      schoolStartTime: settings.schoolStartTime,
      schoolEndTime: settings.schoolEndTime,
      hasBreak: !!settings.breakStartTime,
      breakStartTime: settings.breakStartTime ?? '11:00',
      breakEndTime: settings.breakEndTime ?? '11:30',
    }),
    [settings],
  );
  const { form, onSubmit, serverError, saving } = useSectionForm({
    schema: updateSchoolSettingsSchema,
    values,
    save,
    toApi: (v) => ({
      schoolStartTime: v.schoolStartTime,
      schoolEndTime: v.schoolEndTime,
      breakStartTime: v.hasBreak ? v.breakStartTime : null,
      breakEndTime: v.hasBreak ? v.breakEndTime : null,
    }),
    successTitle: 'Timings saved',
  });
  const { register, watch, formState: { errors, isDirty }, reset } = form;
  const hasBreak = watch('hasBreak');
  return (
    <SectionFrame icon={<Sun size={18} />} title="School timings" description="When the school day starts and ends, and the break in between." canEdit={canEdit} dirty={isDirty} saving={saving} error={serverError} onSubmit={onSubmit} onDiscard={() => reset(values)}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="School starts" type="time" leftIcon={<LogIn size={16} />} error={errors.schoolStartTime?.message} {...register('schoolStartTime')} />
        <TextField label="School ends" type="time" leftIcon={<LogOut size={16} />} error={errors.schoolEndTime?.message} {...register('schoolEndTime')} />
      </div>
      <ToggleRow title="The day has a break" description="Lunch or recess. Students on a first-half or second-half day are split around it." {...register('hasBreak')} />
      {hasBreak && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Break starts" type="time" leftIcon={<Coffee size={16} />} error={errors.breakStartTime?.message} {...register('breakStartTime')} />
          <TextField label="Break ends" type="time" leftIcon={<Coffee size={16} />} error={errors.breakEndTime?.message} {...register('breakEndTime')} />
        </div>
      )}
      <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
        <Clock size={14} className="mt-0.5 shrink-0 text-slate-400" />
        Times are in your school’s time zone ({timezone.replace(/_/g, ' ')}).
      </p>
    </SectionFrame>
  );
}

function WorkingDaysCard({ settings, canEdit }: { settings: SchoolSettings; canEdit: boolean }) {
  const save = useSettingsSave();
  const values = useMemo(() => ({ workingDays: settings.workingDays, offSaturdays: settings.offSaturdays }), [settings]);
  const { form, onSubmit, serverError, saving } = useSectionForm({ schema: updateSchoolSettingsSchema, values, save, successTitle: 'Working days saved' });
  const { watch, setValue, formState: { errors, isDirty }, reset } = form;
  const days = watch('workingDays') ?? [];
  const off = watch('offSaturdays') ?? [];
  const toggle = (field: 'workingDays' | 'offSaturdays', list: number[], n: number) =>
    setValue(field, (list.includes(n) ? list.filter((x) => x !== n) : [...list, n]).sort((a, b) => a - b), { shouldDirty: true, shouldValidate: true });

  const summary = [...days]
    .sort((a, b) => a - b)
    .map((d) => (d === 6 && off.length > 0 ? `Sat (except ${off.map((o) => ORDINALS[o - 1]).join(', ')})` : SHORT_DAYS[d - 1]))
    .join(', ');

  return (
    <SectionFrame icon={<CalendarDays size={18} />} title="Working days" description="Which days of the week the school is open. Attendance isn’t taken on the others." canEdit={canEdit} dirty={isDirty} saving={saving} error={serverError} onSubmit={onSubmit} onDiscard={() => reset(values)}>
      <div role="group" aria-label="Working days" className="flex flex-wrap gap-2">
        {WEEKDAY_LABELS.map((label, i) => {
          const n = i + 1;
          const on = days.includes(n);
          return (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              onClick={() => toggle('workingDays', days, n)}
              className={['min-w-[4.25rem] rounded-xl border px-3 py-2 text-sm font-semibold transition-all disabled:cursor-not-allowed', on ? 'border-brand-blue bg-brand-blue text-white shadow-glow' : 'border-slate-200 bg-white text-slate-600 hover:border-brand-blue/40'].join(' ')}
            >
              {SHORT_DAYS[i]}
            </button>
          );
        })}
      </div>
      {errors.workingDays?.message && <p role="alert" className="text-sm font-medium text-red-600">{String(errors.workingDays.message)}</p>}

      <div className={days.includes(6) ? '' : 'opacity-50'}>
        <p className="text-sm font-semibold text-navy">Saturdays that are off</p>
        <p className="mb-2 text-xs text-slate-500">Many schools close on the 2nd and 4th Saturday of the month.</p>
        <div role="group" aria-label="Saturdays that are off" className="flex flex-wrap gap-2">
          {ORDINALS.map((label, i) => {
            const n = i + 1;
            const on = off.includes(n);
            return (
              <button
                key={label}
                type="button"
                disabled={!days.includes(6) || !canEdit}
                aria-pressed={on}
                onClick={() => toggle('offSaturdays', off, n)}
                className={['rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all disabled:cursor-not-allowed', on ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-600 hover:border-amber-300'].join(' ')}
              >
                {label} Saturday
              </button>
            );
          })}
        </div>
      </div>
      <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
        <span className="font-semibold text-navy">Teaching week: </span>
        {summary || 'no working days selected'}
      </p>
    </SectionFrame>
  );
}

function StaffHoursCard({ school, canEdit }: { school: School; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const save = async (data: Record<string, unknown>) => {
    await api.patch('/schools/me', data);
    await queryClient.invalidateQueries({ queryKey: CURRENT_SCHOOL_QUERY_KEY });
  };
  const values = useMemo(
    () => ({ staffPunchInTime: school.staffPunchInTime, staffPunchOutTime: school.staffPunchOutTime, staffLateGraceMinutes: String(school.staffLateGraceMinutes) }),
    [school],
  );
  const { form, onSubmit, serverError, saving } = useSectionForm({
    schema: updateSchoolSchema,
    values,
    save,
    toApi: (v) => ({ ...v, staffLateGraceMinutes: Number(v.staffLateGraceMinutes) }),
    successTitle: 'Staff hours saved',
  });
  const { register, formState: { errors, isDirty }, reset } = form;
  return (
    <SectionFrame icon={<Timer size={18} />} title="Staff working hours" description="When teachers and staff are expected to punch in and out. Used to flag late arrivals and early departures." canEdit={canEdit} dirty={isDirty} saving={saving} error={serverError} onSubmit={onSubmit} onDiscard={() => reset(values)}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <TextField label="Punch-in time" type="time" leftIcon={<LogIn size={16} />} error={errors.staffPunchInTime?.message} {...register('staffPunchInTime')} />
        <TextField label="Punch-out time" type="time" leftIcon={<LogOut size={16} />} error={errors.staffPunchOutTime?.message} {...register('staffPunchOutTime')} />
        <TextField label="Grace period (minutes)" type="number" min={0} max={120} leftIcon={<Hourglass size={16} />} helperText="Punching in this long after the start time is still on time." error={errors.staffLateGraceMinutes?.message} {...register('staffLateGraceMinutes')} />
      </div>
    </SectionFrame>
  );
}
