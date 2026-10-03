'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, ConfirmDialog, Dialog, SelectField, Skeleton, TextAreaField, TextField, useToast } from '@schovexa/ui';
import { ArrowLeft, CheckCheck, Paperclip, Pencil, Save } from 'lucide-react';
import { useCourseworkDetail, type CourseworkDetailFull, type FileInfo, type SubmissionStatus } from '../../hooks/useTeaching';
import { useCan } from '../../hooks/useCan';
import { api, ApiError } from '../../lib/api-client';
import { FilePanel, PRIORITY_LABELS, PRIORITY_TONES, SUBMISSION_LABELS, SUBMISSION_TONES, shortDay, useRefreshTeaching } from './teaching-ui';

type Kind = 'HOMEWORK' | 'ASSIGNMENT';
type RosterRow = CourseworkDetailFull['roster'][number];
interface Draft {
  status: SubmissionStatus;
  marks: string;
  feedback: string;
}

const PERMS: Record<Kind, { edit: string; review: string; base: string; noun: string }> = {
  HOMEWORK: { edit: 'homework.create', review: 'homework.review', base: '/homework', noun: 'homework' },
  ASSIGNMENT: { edit: 'assignment.create', review: 'assignment.evaluate', base: '/assignments', noun: 'assignment' },
};

const draftOf = (r: RosterRow): Draft => ({ status: r.status, marks: r.marks === null ? '' : String(r.marks), feedback: r.feedback ?? '' });

function EditDialog({ kind, work, open, onClose }: { kind: Kind; work: CourseworkDetailFull; open: boolean; onClose: () => void }) {
  const perms = PERMS[kind];
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const [title, setTitle] = useState(work.title);
  const [description, setDescription] = useState(work.description ?? '');
  const [dueDate, setDueDate] = useState(work.dueDate);
  const [priority, setPriority] = useState<string>(work.priority);
  const [maxMarks, setMaxMarks] = useState(work.maxMarks ? String(work.maxMarks) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`${perms.base}/${work.id}`, {
        title: title.trim(),
        description: description.trim(),
        dueDate,
        priority,
        ...(kind === 'ASSIGNMENT' ? { maxMarks: maxMarks ? Number(maxMarks) : null } : {}),
      });
      await refresh();
      toast.show({ tone: 'success', title: 'Saved', description: 'Parents were told about the change.' });
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
      title={`Edit ${perms.noun}`}
      description="Changing the due date or details tells the parents again."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>Save changes</Button>
        </>
      }
    >
      {error && <Alert variant="error" className="mb-3">{error}</Alert>}
      <div className="flex flex-col gap-4">
        <TextField label="Title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <TextAreaField label="Instructions" rows={3} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <SelectField label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </SelectField>
        </div>
        {kind === 'ASSIGNMENT' && <TextField label="Maximum marks" type="number" min={1} max={1000} value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} />}
      </div>
    </Dialog>
  );
}

/** A student's own scans or photos of their work, attached to their submission. */
function StudentFilesDialog({ kind, workId, student, onClose, canEdit }: { kind: Kind; workId: string; student: RosterRow | null; onClose: () => void; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const path = student ? `${PERMS[kind].base}/${workId}/students/${student.studentId}/files` : '';
  const { data } = useQuery({ queryKey: ['teaching', 'submission-files', workId, student?.studentId], queryFn: () => api.get<{ files: FileInfo[] }>(path), enabled: !!student });
  const refresh = useRefreshTeaching();
  return (
    <Dialog open={!!student} onClose={onClose} title={student ? `${student.name}’s work` : ''} description="Scans or photos of the work they handed in.">
      {student && (
        <FilePanel
          basePath={path}
          files={data?.files ?? []}
          canEdit={canEdit}
          title="Files"
          hint="Nothing attached. Add a scan or photo if the work came in on paper."
          onChanged={async () => {
            await queryClient.invalidateQueries({ queryKey: ['teaching', 'submission-files', workId, student.studentId] });
            await refresh();
          }}
        />
      )}
    </Dialog>
  );
}

export function CourseworkDetail({ kind }: { kind: Kind }) {
  const perms = PERMS[kind];
  const { id } = useParams<{ id: string }>();
  const { can } = useCan();
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const { data: work, isLoading, isError } = useCourseworkDetail(kind, id);
  const canEdit = can(perms.edit);
  const canReview = can(perms.review);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<'CANCELLED' | 'ACTIVE' | null>(null);
  const [filesFor, setFilesFor] = useState<RosterRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from the saved state whenever the server's copy changes.
  useEffect(() => {
    if (work) setDrafts(Object.fromEntries(work.roster.map((r) => [r.studentId, draftOf(r)])));
  }, [work]);

  const changed = useMemo(() => {
    if (!work) return [];
    return work.roster.filter((r) => {
      const d = drafts[r.studentId];
      const base = draftOf(r);
      return d && (d.status !== base.status || d.marks !== base.marks || d.feedback !== base.feedback);
    });
  }, [work, drafts]);

  if (isError) {
    return (
      <div className="mx-auto max-w-3xl">
        <Alert variant="error">We couldn’t find that {perms.noun}.</Alert>
      </div>
    );
  }
  if (isLoading || !work) return <Skeleton className="mx-auto h-96 max-w-4xl" />;

  const setDraft = (studentId: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [studentId]: { ...d[studentId]!, ...patch } }));
  const marked = kind === 'ASSIGNMENT' && !!work.maxMarks;
  const active = work.status === 'ACTIVE';
  const backHref = kind === 'HOMEWORK' ? '/dashboard/homework' : '/dashboard/assignments';
  const handedIn = work.roster.filter((r) => r.status !== 'PENDING').length;

  const markAllHandedIn = () => {
    setDrafts((d) => {
      const next = { ...d };
      for (const r of work.roster) if (next[r.studentId]!.status === 'PENDING') next[r.studentId] = { ...next[r.studentId]!, status: 'SUBMITTED' };
      return next;
    });
  };

  const save = async () => {
    setError(null);
    const records = changed.map((r) => {
      const d = drafts[r.studentId]!;
      const marks = d.marks.trim() === '' ? null : Number(d.marks);
      return { studentId: r.studentId, status: d.status, marks: marked ? marks : null, feedback: d.feedback.trim() };
    });
    for (const r of records) {
      if (r.marks !== null && (Number.isNaN(r.marks) || r.marks < 0 || (work.maxMarks && r.marks > work.maxMarks))) {
        return setError(`Marks must be between 0 and ${work.maxMarks}.`);
      }
    }
    setBusy(true);
    try {
      await api.post(`${perms.base}/${id}/submissions`, { records });
      await refresh();
      toast.show({ tone: 'success', title: 'Saved', description: `${records.length} ${records.length === 1 ? 'student' : 'students'} updated.` });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: 'CANCELLED' | 'ACTIVE') => {
    setBusy(true);
    try {
      await api.patch(`${perms.base}/${id}`, { status });
      await refresh();
      toast.show({ tone: 'success', title: status === 'CANCELLED' ? `${perms.noun[0]!.toUpperCase()}${perms.noun.slice(1)} cancelled` : 'Reopened' });
      setConfirm(null);
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not update', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-brand-blue">
        <ArrowLeft size={14} /> Back
      </Link>

      <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight text-navy">
              {work.title}
              {work.priority !== 'NORMAL' && <Badge tone={PRIORITY_TONES[work.priority]}>{PRIORITY_LABELS[work.priority]}</Badge>}
              {work.status !== 'ACTIVE' && <Badge tone="neutral">{work.status === 'CANCELLED' ? 'Cancelled' : 'Archived'}</Badge>}
              {work.overdue && <Badge tone="danger">Past due</Badge>}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {work.subject.name} · {work.section.name} · due {shortDay(work.dueDate)}
              {work.maxMarks ? <> · out of {work.maxMarks}</> : null}
              {!work.wholeSection && <> · {work.studentCount} selected {work.studentCount === 1 ? 'student' : 'students'}</>}
            </p>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              {active && (
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  <Pencil size={14} /> Edit
                </Button>
              )}
              {work.status === 'CANCELLED' ? (
                <Button variant="secondary" size="sm" onClick={() => setConfirm('ACTIVE')}>Reopen</Button>
              ) : active ? (
                <Button variant="soft-danger" size="sm" onClick={() => setConfirm('CANCELLED')}>Cancel {perms.noun}</Button>
              ) : null}
            </div>
          )}
        </div>
        {work.description && <p className="mt-4 whitespace-pre-line text-sm text-slate-700">{work.description}</p>}
        <div className="mt-5 border-t border-slate-100 pt-4">
          <FilePanel basePath={`${perms.base}/${id}/files`} files={work.files} canEdit={canEdit && active} onChanged={refresh} title="Attachments" hint={canEdit ? 'No attachments. Add a worksheet or reference PDF.' : 'No attachments.'} />
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-navy">{canReview ? 'Students' : 'Your children'}</h2>
            <p className="text-sm text-slate-500">{handedIn} of {work.roster.length} handed in</p>
          </div>
          {canReview && active && (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={markAllHandedIn}>
                <CheckCheck size={14} /> Everyone handed in
              </Button>
              <Button size="sm" onClick={save} loading={busy} disabled={changed.length === 0}>
                <Save size={14} /> Save{changed.length > 0 ? ` (${changed.length})` : ''}
              </Button>
            </div>
          )}
        </div>
        {error && <Alert variant="error" className="mt-3">{error}</Alert>}

        <ul className="mt-4 flex flex-col gap-2">
          {work.roster.map((r) => {
            const d = drafts[r.studentId] ?? draftOf(r);
            return (
              <li key={r.studentId} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-navy">
                      {r.rollNo ? <span className="mr-2 text-xs font-normal text-slate-400">#{r.rollNo}</span> : null}
                      {r.name}
                    </p>
                    <p className="text-xs text-slate-400">{r.admissionNo}{r.submittedAt ? ` · handed in ${shortDay(r.submittedAt.slice(0, 10))}` : ''}</p>
                  </div>
                  {canReview && active ? (
                    <>
                      <SelectField fieldSize="sm" aria-label={`Status for ${r.name}`} value={d.status} onChange={(e) => setDraft(r.studentId, { status: e.target.value as SubmissionStatus })} className="w-36">
                        {Object.entries(SUBMISSION_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </SelectField>
                      {marked && (
                        <input
                          type="number"
                          min={0}
                          max={work.maxMarks ?? undefined}
                          inputMode="decimal"
                          aria-label={`Marks for ${r.name}`}
                          placeholder={`/${work.maxMarks}`}
                          value={d.marks}
                          onChange={(e) => setDraft(r.studentId, { marks: e.target.value })}
                          className="h-9 w-20 rounded-lg border border-slate-200 px-2 text-sm tabular-nums focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                        />
                      )}
                      <input
                        type="text"
                        aria-label={`Feedback for ${r.name}`}
                        placeholder="Feedback"
                        maxLength={500}
                        value={d.feedback}
                        onChange={(e) => setDraft(r.studentId, { feedback: e.target.value })}
                        className="h-9 min-w-40 flex-1 rounded-lg border border-slate-200 px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                      />
                      <Button size="sm" variant="ghost" onClick={() => setFilesFor(r)} aria-label={`Files for ${r.name}`}>
                        <Paperclip size={14} /> {r.files > 0 ? r.files : ''}
                      </Button>
                    </>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone={SUBMISSION_TONES[r.status]}>{SUBMISSION_LABELS[r.status]}</Badge>
                      {r.marks !== null && <span className="font-semibold text-navy">{r.marks}{work.maxMarks ? `/${work.maxMarks}` : ''}</span>}
                      {r.feedback && <span className="text-slate-500">“{r.feedback}”</span>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
          {work.roster.length === 0 && <li className="text-sm text-slate-500">No students on this list.</li>}
        </ul>
      </div>

      {canEdit && <EditDialog key={work.id + work.dueDate + work.title} kind={kind} work={work} open={editing} onClose={() => setEditing(false)} />}
      <StudentFilesDialog kind={kind} workId={id} student={filesFor} onClose={() => setFilesFor(null)} canEdit={canReview && active} />
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'CANCELLED' ? `Cancel this ${perms.noun}?` : 'Reopen?'}
        description={confirm === 'CANCELLED' ? 'Students and parents will see it as cancelled. Nothing is deleted.' : 'It becomes active again.'}
        confirmLabel={confirm === 'CANCELLED' ? 'Cancel it' : 'Reopen'}
        tone={confirm === 'CANCELLED' ? 'danger' : 'default'}
        loading={busy}
        onConfirm={() => confirm && setStatus(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
