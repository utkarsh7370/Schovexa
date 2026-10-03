'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Alert, Badge, Button, ConfirmDialog, Dialog, Skeleton, TextAreaField, useToast } from '@schovexa/ui';
import { ArrowLeft, Check, CheckCircle2, Megaphone, Save, Send, Undo2 } from 'lucide-react';
import { usePaper, type MarksStatus, type PaperDetail } from '../../hooks/useTeaching';
import { useCan } from '../../hooks/useCan';
import { api, ApiError } from '../../lib/api-client';
import { formatDay } from '../finance/finance-ui';
import { MARKS_LABELS, MARKS_TONES, shortDay, useRefreshTeaching } from './teaching-ui';

type Row = PaperDetail['roster'][number];
interface Draft {
  marks: string;
  absent: boolean;
  remark: string;
}
type Action = 'submit' | 'review' | 'approve' | 'publish' | 'return' | 'correction';

const STEPS: { status: MarksStatus; label: string }[] = [
  { status: 'DRAFT', label: 'Entered' },
  { status: 'SUBMITTED', label: 'Submitted' },
  { status: 'REVIEWED', label: 'Reviewed' },
  { status: 'APPROVED', label: 'Approved' },
  { status: 'PUBLISHED', label: 'Published' },
];
const ORDER: Record<MarksStatus, number> = { DRAFT: 0, CORRECTION: 0, SUBMITTED: 1, REVIEWED: 2, APPROVED: 3, PUBLISHED: 4 };

const draftOf = (r: Row): Draft => ({ marks: r.marks === null ? '' : String(r.marks), absent: r.absent, remark: r.remark ?? '' });

function Stepper({ status }: { status: MarksStatus }) {
  const at = ORDER[status];
  return (
    <ol className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold" aria-label="Where these marks are in the approval process">
      {STEPS.map((step, i) => (
        <li key={step.status} className="flex items-center gap-2">
          <span className={['flex items-center gap-1 rounded-full px-2.5 py-1', i < at || (i === at && status !== 'CORRECTION') ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400', i === at ? 'ring-1 ring-emerald-300' : ''].join(' ')}>
            {i < at ? <CheckCircle2 size={12} /> : null}
            {step.label}
          </span>
          {i < STEPS.length - 1 && <span className="text-slate-300">→</span>}
        </li>
      ))}
    </ol>
  );
}

export function PaperDetailView() {
  const { paperId } = useParams<{ paperId: string }>();
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const { can } = useCan();
  const { data: paper, isLoading, isError } = usePaper(paperId);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (paper) setDrafts(Object.fromEntries(paper.roster.map((r) => [r.studentId, draftOf(r)])));
  }, [paper]);

  const changed = useMemo(() => {
    if (!paper) return [];
    return paper.roster.filter((r) => {
      const d = drafts[r.studentId];
      const base = draftOf(r);
      return d && (d.marks !== base.marks || d.absent !== base.absent || d.remark !== base.remark);
    });
  }, [paper, drafts]);

  if (isError) {
    return (
      <div className="mx-auto max-w-3xl">
        <Alert variant="error">We couldn’t find that paper.</Alert>
      </div>
    );
  }
  if (isLoading || !paper) return <Skeleton className="mx-auto h-96 max-w-4xl" />;

  const canEnter = can('marks.enter') && paper.editable;
  const entered = paper.roster.filter((r) => r.absent || r.marks !== null).length;
  const setDraft = (studentId: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [studentId]: { ...d[studentId]!, ...patch } }));

  const toRecords = (rows: Row[]) =>
    rows.map((r) => {
      const d = drafts[r.studentId]!;
      return { studentId: r.studentId, marks: d.absent || d.marks.trim() === '' ? null : Number(d.marks), absent: d.absent, remark: d.remark.trim() };
    });

  const validate = (rows: Row[]): string | null => {
    for (const rec of toRecords(rows)) {
      if (rec.marks !== null && (Number.isNaN(rec.marks) || rec.marks < 0 || rec.marks > paper.maxMarks)) return `Marks must be between 0 and ${paper.maxMarks}.`;
    }
    return null;
  };

  const save = async (quiet = false): Promise<boolean> => {
    if (changed.length === 0) return true;
    const problem = validate(changed);
    if (problem) {
      setError(problem);
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      await api.put(`/exams/papers/${paperId}/marks`, { records: toRecords(changed) });
      await refresh();
      if (!quiet) toast.show({ tone: 'success', title: 'Marks saved', description: 'They stay as a draft until you submit.' });
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!action) return;
    if ((action === 'return' || action === 'correction') && note.trim().length < (action === 'return' ? 3 : 5)) return setError(action === 'return' ? 'Say what needs fixing.' : 'Say why the marks need correcting (at least 5 characters).');
    setBusy(true);
    setError(null);
    try {
      if (action === 'submit' && !(await save(true))) {
        setBusy(false);
        setAction(null);
        return;
      }
      const body = action === 'return' ? { note: note.trim() } : action === 'correction' ? { reason: note.trim() } : undefined;
      const path = action === 'correction' ? 'corrections' : action;
      await api.post(`/exams/papers/${paperId}/${path}`, body);
      await refresh();
      toast.show({
        tone: 'success',
        title: { submit: 'Submitted for review', review: 'Marked as reviewed', approve: 'Approved', publish: 'Results published', return: 'Sent back to the teacher', correction: 'Correction requested' }[action],
        description: action === 'publish' ? 'Parents can now see these results.' : undefined,
      });
      setAction(null);
      setNote('');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong.';
      // The yes/no dialogs have no room for a message, so those errors surface as a toast.
      if (action === 'return' || action === 'correction') setError(message);
      else {
        toast.show({ tone: 'error', title: 'Could not do that', description: message });
        setAction(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const canReview = can('marks.review');
  const canApprove = can('marks.approve');
  const status = paper.status;
  const requested = paper.corrections.some((c) => c.status === 'REQUESTED');

  const actions: { key: Action; label: string; icon: React.ReactNode; variant?: 'primary' | 'secondary' | 'soft-danger' }[] = [];
  if (can('marks.enter') && paper.editable) actions.push({ key: 'submit', label: 'Submit for review', icon: <Send size={14} /> });
  if (can('marks.enter') && !paper.editable && !requested) actions.push({ key: 'correction', label: 'Request a correction', icon: <Undo2 size={14} />, variant: 'secondary' });
  if (canReview && status === 'SUBMITTED') actions.push({ key: 'review', label: 'Mark as reviewed', icon: <Check size={14} /> });
  if ((canReview || canApprove) && (status === 'SUBMITTED' || status === 'REVIEWED') && (canReview || status === 'REVIEWED')) actions.push({ key: 'return', label: 'Send back', icon: <Undo2 size={14} />, variant: 'soft-danger' });
  if (canApprove && (status === 'REVIEWED' || (status === 'SUBMITTED' && canReview))) actions.push({ key: 'approve', label: 'Approve', icon: <Check size={14} /> });
  if (canApprove && status === 'APPROVED') actions.push({ key: 'publish', label: 'Publish results', icon: <Megaphone size={14} /> });

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard/marks" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-brand-blue">
        <ArrowLeft size={14} /> Marks & exams
      </Link>

      <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight text-navy">
              {paper.subject.name} <span className="text-lg font-semibold text-slate-500">· {paper.section.name}</span>
              <Badge tone={MARKS_TONES[status]}>{MARKS_LABELS[status]}</Badge>
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {paper.examName} · out of {paper.maxMarks}
              {paper.date ? <> · {shortDay(paper.date)}{paper.startTime ? ` at ${paper.startTime}` : ''}</> : null}
              {paper.room ? <> · room {paper.room}</> : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <Button key={a.key} size="sm" variant={a.variant ?? 'primary'} onClick={() => { setAction(a.key); setNote(''); setError(null); }}>
                {a.icon} {a.label}
              </Button>
            ))}
          </div>
        </div>
        <Stepper status={status} />
        {paper.returnNote && status === 'DRAFT' && <Alert variant="warning" className="mt-4">Sent back: “{paper.returnNote}”</Alert>}
        {status === 'CORRECTION' && <Alert variant="info" className="mt-4">A correction was approved. Change what is wrong, then submit again — the old and new values are logged.</Alert>}
        {requested && <Alert variant="info" className="mt-4">A correction request is waiting for a decision.</Alert>}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-navy">Marks</h2>
            <p className="text-sm text-slate-500">{entered} of {paper.roster.length} entered · pass mark {paper.passPercent}%</p>
          </div>
          {canEnter && (
            <Button size="sm" onClick={() => save()} loading={busy && !action} disabled={changed.length === 0}>
              <Save size={14} /> Save draft{changed.length > 0 ? ` (${changed.length})` : ''}
            </Button>
          )}
        </div>
        {error && !action && <Alert variant="error" className="mt-3">{error}</Alert>}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3 font-semibold">Student</th>
                <th className="py-2 pr-3 font-semibold">Marks (/{paper.maxMarks})</th>
                <th className="py-2 pr-3 font-semibold">Absent</th>
                <th className="py-2 font-semibold">Remark</th>
              </tr>
            </thead>
            <tbody>
              {paper.roster.map((r) => {
                const d = drafts[r.studentId] ?? draftOf(r);
                const pass = r.marks !== null && (r.marks / paper.maxMarks) * 100 >= paper.passPercent;
                return (
                  <tr key={r.studentId} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 pr-3">
                      <p className="font-semibold text-navy">{r.rollNo ? <span className="mr-2 text-xs font-normal text-slate-400">#{r.rollNo}</span> : null}{r.name}</p>
                      <p className="text-xs text-slate-400">{r.admissionNo}</p>
                    </td>
                    {canEnter ? (
                      <>
                        <td className="py-2 pr-3">
                          <input
                            type="number"
                            min={0}
                            max={paper.maxMarks}
                            step="0.5"
                            inputMode="decimal"
                            aria-label={`Marks for ${r.name}`}
                            disabled={d.absent}
                            value={d.absent ? '' : d.marks}
                            onChange={(e) => setDraft(r.studentId, { marks: e.target.value })}
                            className="h-9 w-24 rounded-lg border border-slate-200 px-2 tabular-nums focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:bg-slate-50"
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input type="checkbox" aria-label={`${r.name} was absent`} checked={d.absent} onChange={(e) => setDraft(r.studentId, { absent: e.target.checked, marks: e.target.checked ? '' : d.marks })} className="h-4 w-4 rounded border-slate-300" />
                        </td>
                        <td className="py-2">
                          <input
                            type="text"
                            aria-label={`Remark for ${r.name}`}
                            maxLength={200}
                            value={d.remark}
                            onChange={(e) => setDraft(r.studentId, { remark: e.target.value })}
                            className="h-9 w-full min-w-40 rounded-lg border border-slate-200 px-3 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className={['py-2 pr-3 font-semibold tabular-nums', r.marks !== null ? (pass ? 'text-emerald-700' : 'text-red-600') : 'text-slate-400'].join(' ')}>{r.absent ? '—' : r.marks ?? '—'}</td>
                        <td className="py-2 pr-3">{r.absent ? <Badge tone="warning">Absent</Badge> : ''}</td>
                        <td className="py-2 text-slate-500">{r.remark ?? ''}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {paper.roster.length === 0 && <p className="py-4 text-sm text-slate-500">There are no students in this class.</p>}
        </div>
      </div>

      {paper.corrections.length > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
          <h2 className="text-lg font-bold text-navy">Correction requests</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {paper.corrections.map((c) => (
              <li key={c.id} className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="flex items-center gap-2 font-medium text-navy">
                  <Badge tone={c.status === 'REQUESTED' ? 'warning' : c.status === 'APPROVED' ? 'success' : 'danger'}>{c.status === 'REQUESTED' ? 'Waiting' : c.status === 'APPROVED' ? 'Approved' : 'Rejected'}</Badge>
                  {formatDay(c.createdAt)}
                </p>
                <p className="mt-1 text-slate-600">{c.reason}</p>
                {c.decisionNote && <p className="mt-1 text-xs text-slate-400">Decision: {c.decisionNote}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog
        open={action === 'return' || action === 'correction'}
        onClose={() => setAction(null)}
        title={action === 'return' ? 'Send these marks back?' : 'Ask for a correction'}
        description={action === 'return' ? 'The teacher can change them and submit again.' : 'The marks are locked. Whoever approves marks will decide, and the change is logged.'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAction(null)} disabled={busy}>Cancel</Button>
            <Button variant={action === 'return' ? 'danger' : 'primary'} onClick={run} loading={busy}>{action === 'return' ? 'Send back' : 'Send request'}</Button>
          </>
        }
      >
        {error && action && <Alert variant="error" className="mb-3">{error}</Alert>}
        <TextAreaField label={action === 'return' ? 'What needs fixing?' : 'Why do the marks need to change?'} rows={3} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </Dialog>

      <ConfirmDialog
        open={action === 'submit' || action === 'review' || action === 'approve' || action === 'publish'}
        title={{ submit: 'Submit these marks?', review: 'Mark as reviewed?', approve: 'Approve these marks?', publish: 'Publish these results?', return: '', correction: '' }[action ?? 'submit']}
        description={
          action === 'submit'
            ? `${paper.roster.length - entered > 0 ? `${paper.roster.length - entered} students still have no marks. ` : ''}Once submitted the marks are locked; a change needs a correction request.`
            : action === 'publish'
              ? 'Parents will be able to see these marks, and they will be told.'
              : action === 'approve'
                ? 'The marks are ready to be published to parents.'
                : 'The Principal can then approve them.'
        }
        confirmLabel={{ submit: 'Submit', review: 'Mark as reviewed', approve: 'Approve', publish: 'Publish', return: '', correction: '' }[action ?? 'submit']}
        loading={busy}
        onConfirm={run}
        onCancel={() => setAction(null)}
      />
    </div>
  );
}
