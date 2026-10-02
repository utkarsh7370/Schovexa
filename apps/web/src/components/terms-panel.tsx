'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createTermSchema } from '@schovexa/validation';
import { Alert, Button, Skeleton, TextField, useToast } from '@schovexa/ui';
import { CalendarRange, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { termsQueryKey, useTerms, type AcademicTerm } from '../hooks/useTerms';
import { api, ApiError } from '../lib/api-client';

const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// The terms (Term 1, Semester 2…) of one academic year: they stay inside the
// year and never overlap. The server checks both; this form just says so early.
export function TermsPanel({ yearId, yearName, canEdit }: { yearId: string; yearName: string; canEdit: boolean }) {
  const { data: terms, isLoading, isError } = useTerms(yearId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState({ name: '', startDate: '', endDate: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = (term?: AcademicTerm) => {
    setDraft(term ? { name: term.name, startDate: term.startDate, endDate: term.endDate } : { name: '', startDate: '', endDate: '' });
    setEditing(term ? term.id : 'new');
    setError(null);
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: termsQueryKey(yearId) });

  const save = async () => {
    const parsed = createTermSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the term details.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editing === 'new') await api.post(`/academic-years/${yearId}/terms`, parsed.data);
      else await api.patch(`/academic-years/${yearId}/terms/${editing}`, parsed.data);
      await refresh();
      toast.show({ tone: 'success', title: editing === 'new' ? `${parsed.data.name} added` : `${parsed.data.name} updated` });
      setEditing(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the term.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (term: AcademicTerm) => {
    try {
      await api.delete(`/academic-years/${yearId}/terms/${term.id}`);
      await refresh();
      toast.show({ tone: 'success', title: `${term.name} removed` });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not remove the term', description: err instanceof ApiError ? err.message : 'Please try again.' });
    }
  };

  return (
    <div className="bg-slate-50/70 px-5 pb-5 pt-3 sm:px-6">
      {isLoading && <Skeleton className="h-12 rounded-xl" />}
      {isError && <p className="text-sm text-red-600">Couldn’t load the terms.</p>}
      {terms && terms.length === 0 && editing !== 'new' && <p className="text-sm text-slate-500">No terms yet. Split {yearName} into terms or semesters if your school uses them.</p>}
      <ul className="space-y-2">
        {terms?.map((t) =>
          editing === t.id ? null : (
            <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm">
              <CalendarRange size={15} className="shrink-0 text-brand-blue" />
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-navy">{t.name}</span>
                <span className="ml-2 text-slate-500">{fmt(t.startDate)} – {fmt(t.endDate)}</span>
              </span>
              {canEdit && (
                <span className="flex gap-1">
                  <button type="button" onClick={() => open(t)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-blue" aria-label={`Edit ${t.name}`}><Pencil size={14} /></button>
                  <button type="button" onClick={() => remove(t)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${t.name}`}><Trash2 size={14} /></button>
                </span>
              )}
            </li>
          ),
        )}
      </ul>

      {editing && (
        <div className="mt-3 rounded-xl border border-brand-blue/30 bg-white p-4">
          {error && <Alert variant="error" className="mb-3">{error}</Alert>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TextField label="Term name" placeholder="Term 1" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <TextField label="Starts" type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
            <TextField label="Ends" type="date" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(null)}><X size={14} /> Cancel</Button>
            <Button size="sm" loading={busy} onClick={save}><Check size={14} /> {editing === 'new' ? 'Add term' : 'Save term'}</Button>
          </div>
        </div>
      )}
      {canEdit && !editing && (
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => open()}><Plus size={14} /> Add a term</Button>
      )}
    </div>
  );
}
