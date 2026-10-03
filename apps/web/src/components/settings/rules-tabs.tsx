'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DOCUMENT_MIME_TYPES, updateSchoolSchema, updateSchoolSettingsSchema } from '@schovexa/validation';
import { Button, TextField } from '@schovexa/ui';
import { BellRing, CalendarCheck, Coins, FileText, Hash, Mail, Percent, Plus, ReceiptText, Timer, X } from 'lucide-react';
import { CURRENT_SCHOOL_QUERY_KEY, type School } from '../../hooks/useCurrentSchool';
import type { SchoolSettings } from '../../hooks/useSchoolSettings';
import { api } from '../../lib/api-client';
import { formatMinor, majorToMinor, minorToMajor } from '../../lib/currency';
import { SectionFrame, ToggleRow, useSectionForm } from '../settings-frame';
import { useSettingsSave } from './timings-tab';

export function AttendanceTab({ settings, canEdit }: { settings: SchoolSettings; canEdit: boolean }) {
  const save = useSettingsSave();
  const values = useMemo(
    () => ({
      attendanceEditWindowDays: String(settings.attendanceEditWindowDays),
      attendanceMinPercent: String(settings.attendanceMinPercent),
      attendanceOnNonWorkingDays: settings.attendanceOnNonWorkingDays,
    }),
    [settings],
  );
  const { form, onSubmit, serverError, saving } = useSectionForm({
    schema: updateSchoolSettingsSchema,
    values,
    save,
    toApi: (v) => ({ ...v, attendanceEditWindowDays: Number(v.attendanceEditWindowDays), attendanceMinPercent: Number(v.attendanceMinPercent) }),
    successTitle: 'Attendance rules saved',
  });
  const { register, watch, formState: { errors, isDirty }, reset } = form;
  const days = Number(watch('attendanceEditWindowDays')) || 0;
  return (
    <SectionFrame icon={<CalendarCheck size={18} />} title="Attendance rules" description="How long attendance can be corrected, and which days it’s taken." canEdit={canEdit} dirty={isDirty} saving={saving} error={serverError} onSubmit={onSubmit} onDiscard={() => reset(values)}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Correction window (days)"
          type="number"
          min={0}
          max={30}
          leftIcon={<Timer size={16} />}
          helperText={days === 0 ? 'Attendance can only be marked or changed on the day itself.' : `Attendance can still be corrected for ${days} day${days === 1 ? '' : 's'} after the day. Then it locks for everyone.`}
          error={errors.attendanceEditWindowDays?.message}
          {...register('attendanceEditWindowDays')}
        />
        <TextField
          label="Minimum attendance (%)"
          type="number"
          min={0}
          max={100}
          leftIcon={<Percent size={16} />}
          helperText="Students below this are highlighted as low attendance."
          error={errors.attendanceMinPercent?.message}
          {...register('attendanceMinPercent')}
        />
      </div>
      <ToggleRow title="Allow attendance on days the school is closed" description="Normally attendance isn’t taken on weekly offs or holidays. Turn this on for a make-up Saturday or special event." {...register('attendanceOnNonWorkingDays')} />
    </SectionFrame>
  );
}

export function FeesTab({ settings, canEdit }: { settings: SchoolSettings; canEdit: boolean }) {
  const save = useSettingsSave();
  const values = useMemo(
    () => ({
      receiptPrefix: settings.receiptPrefix,
      allowPartialPayments: settings.allowPartialPayments,
      lateFeePerDay: String(minorToMajor(settings.lateFeePerDayMinor)),
      lateFeeGraceDays: String(settings.lateFeeGraceDays),
      maxDiscountPercent: String(settings.maxDiscountPercent),
      paymentCorrectionWindowDays: String(settings.paymentCorrectionWindowDays),
      notifyPaymentReceipt: settings.notifyPaymentReceipt,
    }),
    [settings],
  );
  const { form, onSubmit, serverError, saving } = useSectionForm({
    schema: updateSchoolSettingsSchema,
    values,
    save,
    toApi: (v) => ({
      receiptPrefix: v.receiptPrefix,
      allowPartialPayments: v.allowPartialPayments,
      lateFeePerDayMinor: majorToMinor(Number(v.lateFeePerDay) || 0),
      lateFeeGraceDays: Number(v.lateFeeGraceDays),
      maxDiscountPercent: Number(v.maxDiscountPercent),
      paymentCorrectionWindowDays: Number(v.paymentCorrectionWindowDays),
      notifyPaymentReceipt: v.notifyPaymentReceipt,
    }),
    fieldMap: { lateFeePerDayMinor: 'lateFeePerDay' },
    successTitle: 'Fee rules saved',
  });
  const { register, watch, formState: { errors, isDirty }, reset } = form;
  const prefix = watch('receiptPrefix') ?? '';
  const perDay = Number(watch('lateFeePerDay')) || 0;
  return (
    <SectionFrame icon={<Coins size={18} />} title="Fee rules" description="How receipts are numbered, how fees can be paid, and late fees." canEdit={canEdit} dirty={isDirty} saving={saving} error={serverError} onSubmit={onSubmit} onDiscard={() => reset(values)}>
      <TextField
        label="Receipt number prefix"
        leftIcon={<ReceiptText size={16} />}
        placeholder="SPS/"
        helperText={`Your next receipt will look like ${prefix}000123.`}
        error={errors.receiptPrefix?.message}
        {...register('receiptPrefix')}
      />
      <ToggleRow title="Accept part payments" description="When off, the accountant must record the whole outstanding balance in one payment." {...register('allowPartialPayments')} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Late fee per day" type="number" min={0} step="0.01" leftIcon={<Coins size={16} />} helperText={perDay > 0 ? `${formatMinor(majorToMinor(perDay))} for each day a fee is overdue.` : 'Leave at 0 for no late fee.'} error={errors.lateFeePerDay?.message} {...register('lateFeePerDay')} />
        <TextField label="Grace days" type="number" min={0} max={365} leftIcon={<Timer size={16} />} helperText="Days after the due date before the late fee starts." error={errors.lateFeeGraceDays?.message} {...register('lateFeeGraceDays')} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Discount the accountant can give alone (%)" type="number" min={0} max={100} leftIcon={<Coins size={16} />} helperText="A plain discount up to this share of a fee is applied at once. Anything bigger, and every scholarship or concession, needs the Principal or Director to approve." error={errors.maxDiscountPercent?.message} {...register('maxDiscountPercent')} />
        <TextField label="Payment correction window (days)" type="number" min={0} max={365} leftIcon={<Timer size={16} />} helperText="How long after a payment is recorded the accountant can still correct it. After that only the Principal or Director can." error={errors.paymentCorrectionWindowDays?.message} {...register('paymentCorrectionWindowDays')} />
      </div>
      <ToggleRow title="Tell parents when a payment is received" description="Sends an in-app notice (and an email, where the school’s mail is set up) with the receipt number and the balance left." {...register('notifyPaymentReceipt')} />
      <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Only cash is accepted for now — there is no online payment gateway. The late fee is shown next to overdue balances so staff can collect it. It never changes the amount billed or the payment history.</p>
    </SectionFrame>
  );
}

export function NotificationsTab({ school, settings, canEdit }: { school: School; settings: SchoolSettings; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <ParentAlertsCard school={school} canEdit={canEdit} />
      <EmailRulesCard settings={settings} canEdit={canEdit} />
    </div>
  );
}

function ParentAlertsCard({ school, canEdit }: { school: School; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const save = async (data: Record<string, unknown>) => {
    await api.patch('/schools/me', data);
    await queryClient.invalidateQueries({ queryKey: CURRENT_SCHOOL_QUERY_KEY });
  };
  const values = useMemo(() => ({ notifyParentsOnAbsence: school.notifyParentsOnAbsence }), [school]);
  const { form, onSubmit, serverError, saving } = useSectionForm({ schema: updateSchoolSchema, values, save, successTitle: 'Parent alerts saved' });
  const { register, formState: { isDirty }, reset } = form;
  return (
    <SectionFrame icon={<BellRing size={18} />} title="Parent alerts" description="Keep families informed without anyone making a phone call." canEdit={canEdit} dirty={isDirty} saving={saving} error={serverError} onSubmit={onSubmit} onDiscard={() => reset(values)}>
      <ToggleRow title="Message parents when their child is marked absent" description="Parents with a portal account get a notification in the app. If a mistake is corrected, they’re told that too." {...register('notifyParentsOnAbsence')} />
    </SectionFrame>
  );
}

function EmailRulesCard({ settings, canEdit }: { settings: SchoolSettings; canEdit: boolean }) {
  const save = useSettingsSave();
  const values = useMemo(
    () => ({
      notifyAbsenceEmail: settings.notifyAbsenceEmail,
      notifyYearApprovalEmail: settings.notifyYearApprovalEmail,
      notifyStaffAttendanceDecisions: settings.notifyStaffAttendanceDecisions,
    }),
    [settings],
  );
  const { form, onSubmit, serverError, saving } = useSectionForm({ schema: updateSchoolSettingsSchema, values, save, successTitle: 'Notification settings saved' });
  const { register, formState: { isDirty }, reset } = form;
  return (
    <SectionFrame icon={<Mail size={18} />} title="Email and in-app messages" description="Choose which messages go out. Email needs your school’s email to be set up." canEdit={canEdit} dirty={isDirty} saving={saving} error={serverError} onSubmit={onSubmit} onDiscard={() => reset(values)}>
      <ToggleRow title="Also email parents about absences" description="Parents with an email address get a message as well as the in-app notification." {...register('notifyAbsenceEmail')} />
      <ToggleRow title="Email the Director about academic years awaiting approval" description="The in-app notice always appears; this adds an email." {...register('notifyYearApprovalEmail')} />
      <ToggleRow title="Tell staff when their attendance is approved or rejected" description="A notification in the app for the teacher or staff member." {...register('notifyStaffAttendanceDecisions')} />
    </SectionFrame>
  );
}

const TYPE_LABELS: Record<string, string> = { 'application/pdf': 'PDF', 'image/jpeg': 'JPEG image', 'image/png': 'PNG image' };

export function DocumentsTab({ settings, canEdit }: { settings: SchoolSettings; canEdit: boolean }) {
  const save = useSettingsSave();
  const values = useMemo(
    () => ({
      documentMaxSizeMb: String(settings.documentMaxSizeMb),
      allowedDocumentTypes: settings.allowedDocumentTypes,
      documentCategories: settings.documentCategories,
      requiredStudentDocuments: settings.requiredStudentDocuments,
    }),
    [settings],
  );
  const { form, onSubmit, serverError, saving } = useSectionForm({
    schema: updateSchoolSettingsSchema,
    values,
    save,
    toApi: (v) => ({ ...v, documentMaxSizeMb: Number(v.documentMaxSizeMb) }),
    successTitle: 'Document settings saved',
  });
  const { register, watch, setValue, formState: { errors, isDirty }, reset } = form;
  const types = watch('allowedDocumentTypes') ?? [];
  const categories = watch('documentCategories') ?? [];
  const required = watch('requiredStudentDocuments') ?? [];
  const [draft, setDraft] = useState('');

  const set = (field: 'allowedDocumentTypes' | 'documentCategories' | 'requiredStudentDocuments', next: string[]) => setValue(field, next, { shouldDirty: true, shouldValidate: true });
  const addCategory = () => {
    const name = draft.trim();
    if (!name || categories.some((c) => c.toLowerCase() === name.toLowerCase())) return;
    set('documentCategories', [...categories, name]);
    setDraft('');
  };
  const removeCategory = (name: string) => {
    set('documentCategories', categories.filter((c) => c !== name));
    if (required.includes(name)) set('requiredStudentDocuments', required.filter((c) => c !== name));
  };

  return (
    <SectionFrame icon={<FileText size={18} />} title="Documents" description="What can be uploaded to student and staff profiles, and what every student must have on file." canEdit={canEdit} dirty={isDirty} saving={saving} error={serverError} onSubmit={onSubmit} onDiscard={() => reset(values)}>
      <TextField label="Largest file allowed (MB)" type="number" min={1} max={25} leftIcon={<FileText size={16} />} helperText="Up to 25 MB." error={errors.documentMaxSizeMb?.message} {...register('documentMaxSizeMb')} />

      <div>
        <p className="text-sm font-semibold text-navy">Allowed file types</p>
        <div className="mt-2 flex flex-wrap gap-3">
          {DOCUMENT_MIME_TYPES.map((type) => (
            <label key={type} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 has-[:checked]:border-brand-blue/50 has-[:checked]:bg-brand-blue/5">
              <input type="checkbox" className="h-4 w-4 accent-brand-blue" checked={types.includes(type)} onChange={() => set('allowedDocumentTypes', types.includes(type) ? types.filter((t) => t !== type) : [...types, type])} />
              {TYPE_LABELS[type]}
            </label>
          ))}
        </div>
        {errors.allowedDocumentTypes?.message && <p role="alert" className="mt-1 text-sm font-medium text-red-600">{String(errors.allowedDocumentTypes.message)}</p>}
      </div>

      <div>
        <p className="text-sm font-semibold text-navy">Document categories</p>
        <p className="mb-2 text-xs text-slate-500">People choose one when they upload. Tick the ones every student must have.</p>
        <ul className="flex flex-wrap gap-2">
          {categories.map((name) => (
            <li key={name} className="flex items-center gap-1 rounded-full border border-slate-200 bg-white py-1 pl-3 pr-1.5 text-sm text-slate-700">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" className="h-3.5 w-3.5 accent-brand-blue" checked={required.includes(name)} disabled={!canEdit} onChange={() => set('requiredStudentDocuments', required.includes(name) ? required.filter((c) => c !== name) : [...required, name])} aria-label={`Required: ${name}`} />
                {name}
                {required.includes(name) && <span className="rounded-full bg-amber-50 px-1.5 text-[10px] font-bold uppercase text-amber-700">Required</span>}
              </label>
              {canEdit && (
                <button type="button" onClick={() => removeCategory(name)} className="rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${name}`}>
                  <X size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {errors.documentCategories?.message && <p role="alert" className="mt-1 text-sm font-medium text-red-600">{String(errors.documentCategories.message)}</p>}
        {errors.requiredStudentDocuments?.message && <p role="alert" className="mt-1 text-sm font-medium text-red-600">{String(errors.requiredStudentDocuments.message)}</p>}
        {canEdit && (
          <div className="mt-3 flex max-w-md items-end gap-2">
            <div className="flex-1">
              <TextField label="Add a category" leftIcon={<Hash size={16} />} placeholder="e.g. Vaccination record" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }} />
            </div>
            <Button type="button" variant="secondary" onClick={addCategory} disabled={!draft.trim()}>
              <Plus size={15} /> Add
            </Button>
          </div>
        )}
      </div>
    </SectionFrame>
  );
}
