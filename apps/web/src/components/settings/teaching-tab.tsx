'use client';

import { useMemo } from 'react';
import { updateSchoolSettingsSchema } from '@schovexa/validation';
import { TextField } from '@schovexa/ui';
import { GraduationCap } from 'lucide-react';
import type { SchoolSettings } from '../../hooks/useSchoolSettings';
import { SectionFrame, ToggleRow, useSectionForm } from '../settings-frame';
import { useSettingsSave } from './timings-tab';

/** What teachers may see and what they leave with parents — the school's own policy, not a code default. */
export function TeachingTab({ settings, canEdit }: { settings: SchoolSettings; canEdit: boolean }) {
  const save = useSettingsSave();
  const values = useMemo(
    () => ({
      teachersSeeParentContact: settings.teachersSeeParentContact,
      shareRemarksWithParents: settings.shareRemarksWithParents,
      teacherDocumentCategories: settings.teacherDocumentCategories,
      casual: String(settings.leaveAllowances.CASUAL),
      sick: String(settings.leaveAllowances.SICK),
      earned: String(settings.leaveAllowances.EARNED),
    }),
    [settings],
  );
  const { form, onSubmit, serverError, saving } = useSectionForm({
    schema: updateSchoolSettingsSchema,
    values,
    save,
    toApi: (v) => ({
      teachersSeeParentContact: v.teachersSeeParentContact,
      shareRemarksWithParents: v.shareRemarksWithParents,
      teacherDocumentCategories: v.teacherDocumentCategories,
      leaveAllowances: { CASUAL: Number(v.casual), SICK: Number(v.sick), EARNED: Number(v.earned) },
    }),
    successTitle: 'Teaching policy saved',
  });
  const { register, watch, setValue, formState: { isDirty }, reset } = form;
  const categories = watch('teacherDocumentCategories') ?? [];
  const available = settings.documentCategories;
  const toggle = (name: string) => setValue('teacherDocumentCategories', categories.includes(name) ? categories.filter((c) => c !== name) : [...categories, name], { shouldDirty: true, shouldValidate: true });

  return (
    <SectionFrame icon={<GraduationCap size={18} />} title="Teaching policy" description="What teachers can see about students and families, and how much leave staff get each year." canEdit={canEdit} dirty={isDirty} saving={saving} error={serverError} onSubmit={onSubmit} onDiscard={() => reset(values)}>
      <ToggleRow title="Teachers can see parents’ phone and email" description="Off by default: teachers still see who the parents are, but contact goes through the school or in-app messages." {...register('teachersSeeParentContact')} />
      <ToggleRow title="Share teachers’ remarks with parents by default" description="A teacher can always choose per remark. This sets what is pre-selected, and what is used when they don’t choose." {...register('shareRemarksWithParents')} />

      <div>
        <p className="text-sm font-semibold text-navy">Documents teachers may open</p>
        <p className="mb-2 text-xs text-slate-500">Teachers only see student documents in these categories (for example a medical note or a learning-support plan). None selected means none.</p>
        {available.length === 0 ? (
          <p className="text-sm text-slate-500">Add document categories on the Documents tab first.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {available.map((name) => (
              <label key={name} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 has-[:checked]:border-brand-blue/50 has-[:checked]:bg-brand-blue/5">
                <input type="checkbox" className="h-4 w-4 accent-brand-blue" checked={categories.includes(name)} disabled={!canEdit} onChange={() => toggle(name)} />
                {name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold text-navy">Yearly leave allowance (days)</p>
        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextField label="Casual" type="number" min={0} max={365} {...register('casual')} />
          <TextField label="Sick" type="number" min={0} max={365} {...register('sick')} />
          <TextField label="Earned" type="number" min={0} max={365} {...register('earned')} />
        </div>
      </div>
    </SectionFrame>
  );
}
