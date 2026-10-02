'use client';

import type { ReactNode } from 'react';
import { forwardRef, useState } from 'react';
import { useForm, type FieldValues, type Resolver, type UseFormReturn, type Path } from 'react-hook-form';
import type { ZodTypeAny } from 'zod';
import { Alert, Badge, Button, useToast } from '@schovexa/ui';
import { Save, Undo2 } from 'lucide-react';
import { ApiError } from '../lib/api-client';

// One settings card = one form with its own Save, so changing the
// timings never sits behind unsaved edits somewhere else on the page.
export function SectionFrame({
  icon,
  title,
  description,
  canEdit,
  dirty,
  saving,
  error,
  onSubmit,
  onDiscard,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  canEdit: boolean;
  dirty: boolean;
  saving: boolean;
  error?: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onDiscard: () => void;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} noValidate className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand-blue ring-1 ring-inset ring-brand-blue/15">{icon}</span>
        <div>
          <h2 className="text-base font-bold text-navy">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </header>
      {error && <Alert variant="error" className="mt-4">{error}</Alert>}
      <fieldset disabled={!canEdit} className="mt-5 flex min-w-0 flex-col gap-4 disabled:opacity-90">
        {children}
      </fieldset>
      {canEdit && (
        <footer className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <span className="text-sm text-slate-500">
            {dirty ? <Badge tone="warning" dot pulse>Unsaved changes</Badge> : 'All changes saved'}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={!dirty || saving} onClick={onDiscard}>
              <Undo2 size={14} /> Discard
            </Button>
            <Button type="submit" size="sm" loading={saving} disabled={!dirty}>
              <Save size={14} /> Save
            </Button>
          </div>
        </footer>
      )}
    </form>
  );
}

/**
 * A form for one settings card: validated with the same schema the API uses,
 * saved through `save`, and any field-level error the server sends lands on
 * the matching input. `toApi` reshapes what the form holds (a "has a break"
 * switch, a price in rupees) into what the API takes, before both the check
 * and the save.
 */
export function useSectionForm<T extends FieldValues>(options: {
  schema: ZodTypeAny;
  values: T;
  save: (data: Record<string, unknown>) => Promise<void>;
  toApi?: (values: T) => Record<string, unknown>;
  /** API field name → form field name, for the ones `toApi` renames. */
  fieldMap?: Record<string, string>;
  successTitle?: string;
}) {
  const { schema, values, save, toApi, fieldMap = {}, successTitle = 'Saved' } = options;
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const resolver: Resolver<T> = async (formValues) => {
    const result = schema.safeParse(toApi ? toApi(formValues as T) : formValues);
    if (result.success) return { values: formValues as T, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const apiKey = String(issue.path[0] ?? 'root');
      const key = fieldMap[apiKey] ?? apiKey;
      if (!errors[key]) errors[key] = { type: 'validation', message: issue.message };
    }
    return { values: {}, errors } as never;
  };
  const form = useForm<T>({ resolver, mode: 'onTouched', values });

  const onSubmit = form.handleSubmit(async (data) => {
    setServerError(null);
    setSaving(true);
    try {
      await save(toApi ? toApi(data as T) : (data as Record<string, unknown>));
      toast.show({ tone: 'success', title: successTitle });
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        err.details.forEach((d) => form.setError((fieldMap[d.field] ?? d.field) as Path<T>, { type: 'server', message: d.message }));
        setServerError(err.message);
      } else {
        setServerError(err instanceof ApiError ? err.message : 'Could not save. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  });

  return { form: form as UseFormReturn<T>, onSubmit, serverError, saving };
}

/** A labelled on/off switch row, styled like the app's other switches. */
export const ToggleRow = forwardRef<HTMLInputElement, { title: string; description?: string } & React.InputHTMLAttributes<HTMLInputElement>>(function ToggleRow(
  { title, description, ...input },
  ref,
) {
  return (
    <label className="flex cursor-pointer items-start gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition-colors hover:border-brand-blue/30 hover:bg-white has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-blue/15">
      <span className="relative mt-0.5 inline-flex h-6 w-11 shrink-0">
        <input ref={ref} type="checkbox" className="peer sr-only" {...input} />
        <span className="absolute inset-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-brand-blue peer-disabled:opacity-50" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
      <span>
        <span className="block text-sm font-bold text-navy">{title}</span>
        {description && <span className="mt-0.5 block text-sm text-slate-500">{description}</span>}
      </span>
    </label>
  );
});
