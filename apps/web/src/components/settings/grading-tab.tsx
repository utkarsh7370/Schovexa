'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DEFAULT_GRADE_BANDS, gradeForPercent, replaceGradingSchema } from '@schovexa/validation';
import { Alert, Badge, Button, TextField, useToast } from '@schovexa/ui';
import { Award, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { GRADING_QUERY_KEY, SCHOOL_SETTINGS_QUERY_KEY, type Grading } from '../../hooks/useSchoolSettings';
import { api, ApiError } from '../../lib/api-client';
import { SectionFrame } from '../settings-frame';

interface Row {
  key: number;
  label: string;
  minPercent: string;
  gradePoint: string;
  remark: string;
}

const toRows = (bands: readonly { label: string; minPercent: number; gradePoint?: number | null; remark?: string | null }[]): Row[] =>
  bands.map((b, i) => ({ key: i, label: b.label, minPercent: String(b.minPercent), gradePoint: b.gradePoint == null ? '' : String(b.gradePoint), remark: b.remark ?? '' }));

export function GradingTab({ grading, canEdit }: { grading: Grading; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const initial = useMemo(() => ({ pass: String(grading.passPercent), rows: toRows(grading.bands) }), [grading]);
  const [pass, setPass] = useState(initial.pass);
  const [rows, setRows] = useState<Row[]>(initial.rows);
  const [nextKey, setNextKey] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tryIt, setTryIt] = useState('72');

  // A fresh copy arrives after saving (or when someone else changes it).
  useEffect(() => {
    setPass(initial.pass);
    setRows(initial.rows);
  }, [initial]);

  const payload = () => ({
    passPercent: Number(pass),
    bands: rows.map((r) => ({ label: r.label.trim(), minPercent: Number(r.minPercent), gradePoint: r.gradePoint === '' ? null : Number(r.gradePoint), remark: r.remark.trim() })),
  });
  const parsed = replaceGradingSchema.safeParse(payload());
  const dirty = JSON.stringify([pass, rows.map(({ key: _key, ...rest }) => rest)]) !== JSON.stringify([initial.pass, initial.rows.map(({ key: _key, ...rest }) => rest)]);

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const sorted = [...rows].sort((a, b) => Number(b.minPercent) - Number(a.minPercent));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the grade scale.');
      return;
    }
    setSaving(true);
    try {
      await api.put('/grading', parsed.data);
      await queryClient.invalidateQueries({ queryKey: GRADING_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: SCHOOL_SETTINGS_QUERY_KEY });
      toast.show({ tone: 'success', title: 'Grading saved' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the grading scale.');
    } finally {
      setSaving(false);
    }
  };

  const percent = Number(tryIt);
  const preview = tryIt !== '' && parsed.success ? gradeForPercent(parsed.data.bands, percent) : null;
  const passMark = Number(pass) || 0;

  return (
    <SectionFrame
      icon={<Award size={18} />}
      title="Grading scale"
      description="Which percentage earns which grade, and the pass mark. Used for report cards and results."
      canEdit={canEdit}
      dirty={dirty}
      saving={saving}
      error={error}
      onSubmit={submit}
      onDiscard={() => {
        setPass(initial.pass);
        setRows(initial.rows);
        setError(null);
      }}
    >
      {grading.isDefault && <Alert variant="info">This is the standard scale. Edit it and save to make it your school’s own.</Alert>}

      <div className="max-w-xs">
        <TextField label="Pass mark (%)" type="number" min={1} max={100} value={pass} onChange={(e) => setPass(e.target.value)} helperText="Below this a student has not passed." />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5">From %</th>
              <th className="px-3 py-2.5">Grade</th>
              <th className="px-3 py-2.5">Grade point</th>
              <th className="px-3 py-2.5">Remark</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((r) => (
              <tr key={r.key}>
                <td className="px-3 py-2"><input aria-label="From percent" type="number" min={0} max={100} value={r.minPercent} onChange={(e) => update(r.key, { minPercent: e.target.value })} className="h-9 w-20 rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:bg-slate-50" /></td>
                <td className="px-3 py-2"><input aria-label="Grade label" value={r.label} maxLength={20} onChange={(e) => update(r.key, { label: e.target.value })} className="h-9 w-28 rounded-lg border border-slate-200 px-2 text-sm font-semibold focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:bg-slate-50" /></td>
                <td className="px-3 py-2"><input aria-label="Grade point" type="number" min={0} max={10} step="0.1" value={r.gradePoint} onChange={(e) => update(r.key, { gradePoint: e.target.value })} className="h-9 w-20 rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:bg-slate-50" /></td>
                <td className="px-3 py-2"><input aria-label="Remark" value={r.remark} maxLength={40} onChange={(e) => update(r.key, { remark: e.target.value })} className="h-9 w-full min-w-[8rem] rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:bg-slate-50" /></td>
                <td className="px-2 py-2">
                  {canEdit && rows.length > 2 && (
                    <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove grade ${r.label}`}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={rows.length >= 15} onClick={() => { setRows((rs) => [...rs, { key: nextKey, label: '', minPercent: '', gradePoint: '', remark: '' }]); setNextKey((k) => k + 1); }}>
            <Plus size={14} /> Add a grade
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => { setRows(toRows(DEFAULT_GRADE_BANDS)); setPass('40'); }}>
            <RotateCcw size={14} /> Use the standard scale
          </Button>
        </div>
      )}

      <div className="rounded-xl bg-slate-50 p-4">
        <p className="text-sm font-semibold text-navy">Try it</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            A student scores
            <input aria-label="Percentage to try" type="number" min={0} max={100} value={tryIt} onChange={(e) => setTryIt(e.target.value)} className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 text-sm" />
            %
          </label>
          {preview ? (
            <>
              <Badge tone="brand">Grade {preview.label}</Badge>
              {preview.remark && <span className="text-sm text-slate-500">{preview.remark}</span>}
              <Badge tone={percent >= passMark ? 'success' : 'danger'} dot>{percent >= passMark ? 'Pass' : 'Not passed'}</Badge>
            </>
          ) : (
            <span className="text-sm text-slate-400">{parsed.success ? 'Enter a percentage from 0 to 100.' : 'Fix the scale above to try it.'}</span>
          )}
        </div>
      </div>
    </SectionFrame>
  );
}
