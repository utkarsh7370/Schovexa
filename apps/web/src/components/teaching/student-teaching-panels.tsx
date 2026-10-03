'use client';

import { useState } from 'react';
import { Alert, Badge, Button, ConfirmDialog, Dialog, EmptyState, SelectField, Skeleton, TextAreaField, useToast } from '@schovexa/ui';
import { Eye, EyeOff, GraduationCap, MessageSquareText, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRemarks, useResults, useTeachingOptions, type RemarkKind, type RemarkRow } from '../../hooks/useTeaching';
import { useCan } from '../../hooks/useCan';
import { api, ApiError } from '../../lib/api-client';
import { SectionCard } from '../section-card';
import { formatDay } from '../finance/finance-ui';
import { useRefreshTeaching } from './teaching-ui';

export const REMARK_LABELS: Record<RemarkKind, string> = {
  ACADEMIC: 'Academic',
  BEHAVIOUR: 'Behaviour',
  STRENGTH: 'Strength',
  WEAK_AREA: 'Area to improve',
  PARTICIPATION: 'Participation',
  HOMEWORK: 'Homework',
  OBSERVATION: 'Observation',
  RECOMMENDATION: 'Recommendation',
};
const KIND_TONES: Record<RemarkKind, 'success' | 'warning' | 'info' | 'neutral' | 'brand'> = { ACADEMIC: 'brand', BEHAVIOUR: 'warning', STRENGTH: 'success', WEAK_AREA: 'warning', PARTICIPATION: 'info', HOMEWORK: 'neutral', OBSERVATION: 'neutral', RECOMMENDATION: 'brand' };

function RemarkDialog({ studentId, remark, open, onClose }: { studentId: string; remark: RemarkRow | null; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const { data: options } = useTeachingOptions(open && !remark);
  const [kind, setKind] = useState<RemarkKind>(remark?.kind ?? 'OBSERVATION');
  const [subjectId, setSubjectId] = useState('');
  const [body, setBody] = useState(remark?.body ?? '');
  const [visible, setVisible] = useState(remark?.visibleToParents ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (body.trim().length < 3) return setError('Write the remark.');
    setBusy(true);
    try {
      if (remark) await api.patch(`/remarks/${remark.id}`, { kind, body: body.trim(), visibleToParents: visible });
      else await api.post('/remarks', { studentId, kind, subjectId: subjectId || undefined, body: body.trim(), visibleToParents: visible });
      await refresh();
      toast.show({ tone: 'success', title: remark ? 'Remark updated' : 'Remark added', description: visible && !remark ? 'The parents have been told.' : undefined });
      if (!remark) setBody('');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={remark ? 'Edit remark' : 'Add a remark'}
      description="Strengths, weak areas, behaviour, participation — what a colleague taking over this class would want to know."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>Save</Button>
        </>
      }
    >
      {error && <Alert variant="error" className="mb-3">{error}</Alert>}
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Type" value={kind} onChange={(e) => setKind(e.target.value as RemarkKind)}>
            {Object.entries(REMARK_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </SelectField>
          {!remark && (
            <SelectField label="Subject (optional)" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Not about one subject</option>
              {options?.subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </SelectField>
          )}
        </div>
        <TextAreaField label="Remark" rows={4} value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)} />
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-navy">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          Share with the student’s parents
        </label>
      </div>
    </Dialog>
  );
}

/** Observations about one student. Private to staff unless the writer shares them with the parents. */
export function StudentRemarksPanel({ studentId }: { studentId: string }) {
  const { can } = useCan();
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const canWrite = can('remark.create');
  const { data, isLoading, isError } = useRemarks(studentId);
  const [editing, setEditing] = useState<RemarkRow | 'new' | null>(null);
  const [removing, setRemoving] = useState<RemarkRow | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.delete(`/remarks/${removing.id}`);
      await refresh();
      setRemoving(null);
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not remove the remark', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      icon={<MessageSquareText size={18} />}
      title="Remarks & observations"
      description={canWrite ? 'Private to staff unless you choose to share a remark with the parents.' : 'Notes from the teachers.'}
      action={
        canWrite && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus size={14} /> Add remark
          </Button>
        )
      }
    >
      {isError && <Alert variant="error">We couldn’t load the remarks.</Alert>}
      {isLoading && <Skeleton className="h-24 w-full" />}
      {data && data.length === 0 && <EmptyState icon={<MessageSquareText size={22} />} title="No remarks yet" description={canWrite ? 'Add the first one — strengths, areas to improve, behaviour, participation.' : 'Nothing has been shared yet.'} />}
      <ul className="flex flex-col gap-3">
        {data?.map((r) => (
          <li key={r.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-navy">
                <Badge tone={KIND_TONES[r.kind]}>{REMARK_LABELS[r.kind]}</Badge>
                {r.subject && <span className="text-slate-500">{r.subject}</span>}
                {canWrite && (
                  <span className="inline-flex items-center gap-1 text-xs font-normal text-slate-400">
                    {r.visibleToParents ? <Eye size={12} /> : <EyeOff size={12} />} {r.visibleToParents ? 'Shared with parents' : 'Staff only'}
                  </span>
                )}
              </p>
              {r.mine && canWrite && (
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" aria-label="Edit remark" onClick={() => setEditing(r)}><Pencil size={14} /></Button>
                  <Button size="sm" variant="ghost" aria-label="Delete remark" onClick={() => setRemoving(r)}><Trash2 size={14} /></Button>
                </span>
              )}
            </div>
            <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{r.body}</p>
            <p className="mt-2 text-xs text-slate-400">{r.author ?? 'A teacher'} · {formatDay(r.createdAt)}</p>
          </li>
        ))}
      </ul>
      {canWrite && editing && <RemarkDialog key={editing === 'new' ? 'new' : editing.id} studentId={studentId} remark={editing === 'new' ? null : editing} open onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!removing} title="Delete this remark?" description="It disappears for everyone, including parents it was shared with." confirmLabel="Delete" tone="danger" loading={busy} onConfirm={remove} onCancel={() => setRemoving(null)} />
    </SectionCard>
  );
}

/** Published exam results, per subject, with grade and pass/fail. */
export function StudentResultsPanel({ studentId }: { studentId: string }) {
  const { data, isLoading, isError } = useResults(studentId);
  return (
    <SectionCard icon={<GraduationCap size={18} />} title="Exam results" description="Published results only.">
      {isError && <Alert variant="error">We couldn’t load the results.</Alert>}
      {isLoading && <Skeleton className="h-32 w-full" />}
      {data && data.exams.length === 0 && <EmptyState icon={<GraduationCap size={22} />} title="No published results yet" description="Results appear here once the Principal has approved and published them." />}
      <div className="flex flex-col gap-6">
        {data?.exams.map((exam) => (
          <section key={exam.examId}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-bold text-navy">{exam.name}</h3>
              <p className="text-sm text-slate-500">
                {exam.totalMarks}/{exam.totalMax}
                {exam.percent !== null && <span className="ml-2 font-semibold text-navy">{exam.percent}%</span>}
              </p>
            </div>
            <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Subject</th>
                    <th className="px-3 py-2 text-right">Marks</th>
                    <th className="px-3 py-2 text-right">%</th>
                    <th className="px-3 py-2">Grade</th>
                    <th className="px-4 py-2">Remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {exam.subjects.map((s) => (
                    <tr key={s.subject}>
                      <td className="px-4 py-2 font-medium text-navy">{s.subject}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.absent ? <Badge tone="warning">Absent</Badge> : `${s.marks ?? '—'}/${s.maxMarks}`}</td>
                      <td className={['px-3 py-2 text-right font-semibold tabular-nums', s.passed === false ? 'text-red-600' : 'text-emerald-700'].join(' ')}>{s.percent !== null ? `${s.percent}%` : '—'}</td>
                      <td className="px-3 py-2">{s.grade ?? '—'}</td>
                      <td className="px-4 py-2 text-slate-500">{s.remark ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </SectionCard>
  );
}
