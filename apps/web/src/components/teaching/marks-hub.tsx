'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert, Badge, Button, ConfirmDialog, Dialog, EmptyState, PageHeader, SelectField, Skeleton, Tabs, TextAreaField, TextField, useToast } from '@schovexa/ui';
import { CalendarDays, Check, ClipboardList, PencilRuler, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { useExams, useMarkCorrections, useMyPapers, usePaperQueue, usePlanningOptions, type ExamRow, type MarkCorrectionRow, type PaperRow } from '../../hooks/useTeaching';
import { useCan } from '../../hooks/useCan';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { api, ApiError } from '../../lib/api-client';
import { formatDay } from '../finance/finance-ui';
import { MARKS_LABELS, MARKS_TONES, shortDay, useRefreshTeaching } from './teaching-ui';

function PaperCard({ paper, hint }: { paper: PaperRow; hint?: string }) {
  return (
    <li>
      <Link href={`/dashboard/marks/${paper.id}`} className="block rounded-2xl border border-slate-100 bg-slate-50/60 p-4 transition-colors hover:border-brand-blue/30 hover:bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-bold text-navy">
              {paper.subject.name}
              <span className="font-normal text-slate-500">· {paper.section.name}</span>
              <Badge tone={MARKS_TONES[paper.status]}>{MARKS_LABELS[paper.status]}</Badge>
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {paper.examName} · out of {paper.maxMarks}
              {paper.date ? <> · {shortDay(paper.date)}{paper.startTime ? ` at ${paper.startTime}` : ''}</> : null}
              {paper.room ? <> · room {paper.room}</> : null}
            </p>
            {paper.returnNote && paper.status === 'DRAFT' && <p className="mt-1 text-sm font-medium text-amber-700">Sent back: “{paper.returnNote}”</p>}
            {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
          </div>
        </div>
      </Link>
    </li>
  );
}

function PaperList({ papers, loading, empty }: { papers: PaperRow[] | undefined; loading: boolean; empty: { title: string; description: string } }) {
  if (loading) return <Skeleton className="h-32 w-full rounded-xl" />;
  if (!papers || papers.length === 0) return <EmptyState icon={<PencilRuler size={22} />} title={empty.title} description={empty.description} />;
  return (
    <ul className="flex flex-col gap-3">
      {papers.map((p) => (
        <PaperCard key={p.id} paper={p} hint={p.submittedAt ? `Submitted ${formatDay(p.submittedAt)}` : undefined} />
      ))}
    </ul>
  );
}

function Corrections({ canDecide }: { canDecide: boolean }) {
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const { data: me } = useCurrentUser();
  const { data, isLoading } = useMarkCorrections();
  const [action, setAction] = useState<{ kind: 'approve' | 'reject'; row: MarkCorrectionRow } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!action) return;
    if (action.kind === 'reject' && note.trim().length < 3) return setError('Say why it is being rejected.');
    setBusy(true);
    setError(null);
    try {
      await api.post(`/exams/corrections/${action.row.id}/${action.kind}`, { note: note.trim() || undefined });
      await refresh();
      toast.show({ tone: 'success', title: action.kind === 'approve' ? 'Marks reopened' : 'Request rejected', description: action.kind === 'approve' ? 'The teacher can now change the marks. Results are hidden until they are published again.' : undefined });
      setAction(null);
      setNote('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <Skeleton className="h-32 w-full rounded-xl" />;
  if (!data || data.length === 0) return <EmptyState icon={<ShieldCheck size={22} />} title="No correction requests" description="Once marks are submitted they are locked. A teacher asks for a correction here, and every change is logged." />;

  return (
    <>
      <ul className="flex flex-col gap-3">
        {data.map((c) => (
          <li key={c.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-bold text-navy">
                  <Link href={`/dashboard/marks/${c.paper.id}`} className="hover:text-brand-blue">{c.paper.subject} · {c.paper.section}</Link>
                  <Badge tone={c.status === 'REQUESTED' ? 'warning' : c.status === 'APPROVED' ? 'success' : 'danger'}>{c.status === 'REQUESTED' ? 'Waiting' : c.status === 'APPROVED' ? 'Approved' : 'Rejected'}</Badge>
                </p>
                <p className="mt-1 text-sm text-slate-600">{c.reason}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {c.paper.exam} · asked by {c.requestedBy ?? 'someone'} on {formatDay(c.createdAt)}
                  {c.decidedBy && <> · decided by {c.decidedBy}{c.decisionNote ? ` (“${c.decisionNote}”)` : ''}</>}
                </p>
              </div>
              {c.status === 'REQUESTED' && canDecide && (
                c.requestedById === me?.id ? (
                  <span className="text-xs text-slate-400">Someone else has to decide your own request</span>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => { setAction({ kind: 'approve', row: c }); setNote(''); setError(null); }}><Check size={14} /> Approve</Button>
                    <Button size="sm" variant="soft-danger" onClick={() => { setAction({ kind: 'reject', row: c }); setNote(''); setError(null); }}><X size={14} /> Reject</Button>
                  </div>
                )
              )}
            </div>
          </li>
        ))}
      </ul>
      <Dialog
        open={!!action}
        onClose={() => setAction(null)}
        title={action?.kind === 'reject' ? 'Reject this correction?' : 'Let the teacher correct the marks?'}
        description={action ? `${action.row.paper.subject} · ${action.row.paper.section}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAction(null)} disabled={busy}>Cancel</Button>
            <Button variant={action?.kind === 'reject' ? 'danger' : 'primary'} onClick={run} loading={busy}>{action?.kind === 'reject' ? 'Reject' : 'Approve'}</Button>
          </>
        }
      >
        {error && <Alert variant="error" className="mb-3">{error}</Alert>}
        <p className="mb-3 text-sm text-slate-600">Reason given: “{action?.row.reason}”</p>
        <TextAreaField label={action?.kind === 'reject' ? 'Why is it rejected? (required)' : 'Note (optional)'} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Dialog>
    </>
  );
}

function PaperDialog({ exam, onClose }: { exam: ExamRow | null; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const { data: options } = usePlanningOptions('exams', !!exam);
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [room, setRoom] = useState('');
  const [maxMarks, setMaxMarks] = useState('100');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjectsHere = useMemo(() => {
    const ids = new Set((options?.assignments ?? []).filter((a) => a.sectionId === sectionId).map((a) => a.subjectId));
    return (options?.subjects ?? []).filter((s) => ids.has(s.id));
  }, [options, sectionId]);

  const save = async () => {
    if (!sectionId || !subjectId) return setError('Choose a class and a subject.');
    setBusy(true);
    setError(null);
    try {
      await api.post(`/exams/${exam!.id}/papers`, {
        sectionId,
        subjectId,
        date: date || undefined,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        room: room.trim() || undefined,
        maxMarks: Number(maxMarks) || 100,
      });
      await refresh();
      toast.show({ tone: 'success', title: 'Paper added' });
      setSubjectId('');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!exam}
      onClose={onClose}
      title="Add a paper"
      description={exam ? `${exam.name} — the class’s subject teacher will enter the marks.` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>Add paper</Button>
        </>
      }
    >
      {error && <Alert variant="error" className="mb-3">{error}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField label="Class" value={sectionId} onChange={(e) => { setSectionId(e.target.value); setSubjectId(''); }}>
          <option value="">Choose a class</option>
          {options?.sections.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </SelectField>
        <SelectField label="Subject" value={subjectId} disabled={!sectionId} onChange={(e) => setSubjectId(e.target.value)} helperText="Only subjects with an assigned teacher.">
          <option value="">{sectionId ? 'Choose a subject' : 'Choose a class first'}</option>
          {subjectsHere.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </SelectField>
        <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <TextField label="Maximum marks" type="number" min={1} max={1000} value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} />
        <TextField label="Starts" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        <TextField label="Ends" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        <TextField label="Room" value={room} maxLength={40} onChange={(e) => setRoom(e.target.value)} />
      </div>
    </Dialog>
  );
}

function ExamDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const { data: options } = usePlanningOptions('exams', open);
  const [name, setName] = useState('');
  const [yearId, setYearId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const years = options?.academicYears ?? [];
  const effectiveYear = yearId || years.find((y) => y.isCurrent)?.id || years[0]?.id || '';

  const save = async () => {
    if (name.trim().length < 2) return setError('Give the exam a name.');
    if (!effectiveYear) return setError('There is no academic year to attach the exam to.');
    if (!startDate || !endDate) return setError('Choose the first and last day.');
    setBusy(true);
    setError(null);
    try {
      await api.post('/exams', { name: name.trim(), academicYearId: effectiveYear, startDate, endDate });
      await refresh();
      toast.show({ tone: 'success', title: 'Exam created', description: 'Now add the papers.' });
      setName('');
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
      title="New exam"
      description="For example “Mid-term 2026”. Add the papers once it exists."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>Create exam</Button>
        </>
      }
    >
      {error && <Alert variant="error" className="mb-3">{error}</Alert>}
      <div className="flex flex-col gap-4">
        <TextField label="Name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        {years.length > 1 && (
          <SelectField label="Academic year" value={effectiveYear} onChange={(e) => setYearId(e.target.value)}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>{y.name}{y.isCurrent ? ' (current)' : ''}</option>
            ))}
          </SelectField>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="First day" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <TextField label="Last day" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}

function Exams({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const { data, isLoading } = useExams();
  const [creating, setCreating] = useState(false);
  const [addingTo, setAddingTo] = useState<ExamRow | null>(null);
  const [removing, setRemoving] = useState<{ kind: 'exam' | 'paper'; id: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.delete(removing.kind === 'exam' ? `/exams/${removing.id}` : `/exams/papers/${removing.id}`);
      await refresh();
      setRemoving(null);
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not remove', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setCreating(true)}><Plus size={16} /> New exam</Button>
        </div>
      )}
      {isLoading && <Skeleton className="h-32 w-full rounded-xl" />}
      {data && data.length === 0 && <EmptyState icon={<CalendarDays size={22} />} title="No exams yet" description={canManage ? 'Create an exam, then add a paper for each class and subject.' : 'Exams your classes sit will be listed here with their dates.'} />}
      <div className="flex flex-col gap-5">
        {data?.map((exam) => (
          <section key={exam.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-navy">{exam.name}</h3>
                <p className="text-xs text-slate-500">{formatDay(exam.startDate)} – {formatDay(exam.endDate)}</p>
              </div>
              {canManage && (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setAddingTo(exam)}><Plus size={14} /> Add paper</Button>
                  <Button size="sm" variant="ghost" aria-label={`Delete ${exam.name}`} onClick={() => setRemoving({ kind: 'exam', id: exam.id, label: exam.name })}><Trash2 size={14} /></Button>
                </div>
              )}
            </div>
            {exam.papers.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No papers yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-100">
                {exam.papers.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <Link href={`/dashboard/marks/${p.id}`} className="min-w-0 font-medium text-navy hover:text-brand-blue">
                      {p.subject.name} <span className="font-normal text-slate-500">· {p.section.name}</span>
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {p.date ? <>{shortDay(p.date)}{p.startTime ? ` ${p.startTime}` : ''}{p.room ? ` · ${p.room}` : ''}</> : 'Date to be set'}
                      <Badge tone={MARKS_TONES[p.status]}>{MARKS_LABELS[p.status]}</Badge>
                      {canManage && (
                        <button type="button" aria-label={`Remove ${p.subject.name} paper`} className="text-slate-400 hover:text-red-600" onClick={() => setRemoving({ kind: 'paper', id: p.id, label: `${p.subject.name} · ${p.section.name}` })}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      {canManage && <ExamDialog open={creating} onClose={() => setCreating(false)} />}
      {canManage && <PaperDialog exam={addingTo} onClose={() => setAddingTo(null)} />}
      <ConfirmDialog
        open={!!removing}
        title={removing?.kind === 'exam' ? 'Delete this exam?' : 'Remove this paper?'}
        description={removing ? `${removing.label}. Papers that already have marks entered can’t be removed.` : undefined}
        confirmLabel="Remove"
        tone="danger"
        loading={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

function MarksView() {
  const params = useSearchParams();
  const { can } = useCan();
  const canEnter = can('marks.enter');
  const canReview = can('marks.review') || can('marks.approve');
  const canDecide = can('marks.approve');
  const canManage = can('exam.manage');
  const tabs = [
    ...(canEnter ? [{ id: 'mine', label: 'My papers' }] : []),
    ...(canReview ? [{ id: 'queue', label: 'To review' }] : []),
    { id: 'exams', label: 'Exams & timetable' },
    ...(can('marks.view') ? [{ id: 'corrections', label: 'Corrections' }] : []),
  ];
  const wanted = params.get('tab');
  const [tab, setTab] = useState(tabs.some((t) => t.id === wanted) ? (wanted as string) : tabs[0]!.id);
  const mine = useMyPapers(canEnter && tab === 'mine');
  const queue = usePaperQueue(undefined, canReview && tab === 'queue');

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Teaching"
        title="Marks & exams"
        description="Teachers enter and submit marks, the coordinator reviews them, the principal approves and publishes. Nothing changes silently after submission."
      />
      <Tabs className="mt-6 w-fit max-w-full" value={tab} onChange={setTab} tabs={tabs} />
      <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
        {tab === 'mine' && <PaperList papers={mine.data} loading={mine.isLoading} empty={{ title: 'No papers for you yet', description: 'When a paper is set up for a class and subject you teach, it appears here for mark entry.' }} />}
        {tab === 'queue' && <PaperList papers={queue.data} loading={queue.isLoading} empty={{ title: 'Nothing is waiting', description: 'Marks that teachers have submitted and are waiting for a decision show up here.' }} />}
        {tab === 'exams' && <Exams canManage={canManage} />}
        {tab === 'corrections' && <Corrections canDecide={canDecide} />}
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-slate-400">
        <ClipboardList size={14} /> Every change to submitted marks is recorded with who made it and the old and new value.
      </p>
    </div>
  );
}

export function MarksHub() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-64 max-w-5xl" />}>
      <MarksView />
    </Suspense>
  );
}
