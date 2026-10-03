'use client';

import { useState } from 'react';
import { Alert, Badge, Button, Dialog, EmptyState, SelectField, Skeleton, Tabs, TextAreaField, TextField, useToast } from '@schovexa/ui';
import { Check, ShieldCheck, X } from 'lucide-react';
import { useAttendanceCorrections, type AttendanceCorrectionRow } from '../../hooks/useTeaching';
import { useCan } from '../../hooks/useCan';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { api, ApiError } from '../../lib/api-client';
import { formatDay } from '../finance/finance-ui';
import { ATTENDANCE_LABELS, shortDay, useRefreshTeaching } from './teaching-ui';

const TONES = { REQUESTED: 'warning', APPROVED: 'success', REJECTED: 'danger' } as const;
const LABELS = { REQUESTED: 'Waiting', APPROVED: 'Approved', REJECTED: 'Rejected' } as const;

export interface CorrectionTarget {
  studentId: string;
  studentName: string;
  sectionId: string;
  date: string;
  current: string | null;
}

/** A locked register can't be edited: the teacher says what it should be and why, and a coordinator decides. */
export function RequestCorrectionDialog({ target, onClose }: { target: CorrectionTarget | null; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const [toStatus, setToStatus] = useState('PRESENT');
  const [remarks, setRemarks] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!target) return;
    if (reason.trim().length < 5) return setError('Say why it needs correcting (at least 5 characters).');
    setBusy(true);
    setError(null);
    try {
      await api.post('/attendance/corrections', { studentId: target.studentId, sectionId: target.sectionId, date: target.date, toStatus, remarks: remarks.trim() || undefined, reason: reason.trim() });
      await refresh();
      toast.show({ tone: 'success', title: 'Correction requested', description: 'Whoever approves attendance corrections has been told.' });
      setReason('');
      setRemarks('');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title="Request an attendance correction"
      description={target ? `${target.studentName} · ${shortDay(target.date)} · currently ${target.current ? ATTENDANCE_LABELS[target.current] ?? target.current : 'not recorded'}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={send} loading={busy}>Send request</Button>
        </>
      }
    >
      {error && <Alert variant="error" className="mb-3">{error}</Alert>}
      <div className="flex flex-col gap-4">
        <SelectField label="It should be" value={toStatus} onChange={(e) => setToStatus(e.target.value)}>
          {Object.entries(ATTENDANCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </SelectField>
        <TextField label="Remark on the register (optional)" value={remarks} maxLength={200} onChange={(e) => setRemarks(e.target.value)} />
        <TextAreaField label="Why does it need correcting?" rows={3} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Dialog>
  );
}

export function AttendanceCorrections() {
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const { can } = useCan();
  const { data: me } = useCurrentUser();
  const canDecide = can('attendance.approveCorrection');
  const [status, setStatus] = useState(canDecide ? 'REQUESTED' : '');
  const { data, isLoading } = useAttendanceCorrections(status || undefined);
  const [action, setAction] = useState<{ kind: 'approve' | 'reject'; row: AttendanceCorrectionRow } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!action) return;
    if (action.kind === 'reject' && note.trim().length < 3) return setError('Say why it is being rejected.');
    setBusy(true);
    setError(null);
    try {
      await api.post(`/attendance/corrections/${action.row.id}/${action.kind}`, { note: note.trim() || undefined });
      await refresh();
      toast.show({ tone: 'success', title: action.kind === 'approve' ? 'Register corrected' : 'Request rejected', description: action.kind === 'approve' ? 'The record was changed and the parents have been told.' : undefined });
      setAction(null);
      setNote('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
      <Tabs className="w-fit max-w-full" value={status} onChange={setStatus} tabs={[{ id: 'REQUESTED', label: canDecide ? 'To decide' : 'Waiting' }, { id: 'APPROVED', label: 'Approved' }, { id: 'REJECTED', label: 'Rejected' }, { id: '', label: 'All' }]} />
      {isLoading && <Skeleton className="mt-4 h-32 w-full rounded-xl" />}
      {data && data.data.length === 0 && (
        <div className="mt-4">
          <EmptyState icon={<ShieldCheck size={22} />} title="No correction requests" description="Once a day is locked, a teacher asks for a correction here, and every approved change is logged." />
        </div>
      )}
      <ul className="mt-4 flex flex-col gap-3">
        {data?.data.map((c) => (
          <li key={c.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-bold text-navy">
                  {c.student.name}
                  <span className="font-mono text-xs font-normal text-slate-400">{c.student.admissionNo}</span>
                  <Badge tone={TONES[c.status]}>{LABELS[c.status]}</Badge>
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {c.section.name} · {shortDay(c.date)}: {c.fromStatus ? ATTENDANCE_LABELS[c.fromStatus] ?? c.fromStatus : 'No record'} → <span className="font-semibold">{ATTENDANCE_LABELS[c.toStatus] ?? c.toStatus}</span>
                </p>
                <p className="mt-1 text-sm text-slate-600">{c.reason}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Asked by {c.requestedBy ?? 'someone'} on {formatDay(c.createdAt)}
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
        title={action?.kind === 'reject' ? 'Reject this correction?' : 'Correct the register?'}
        description={action ? `${action.row.student.name} · ${shortDay(action.row.date)}` : undefined}
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
    </section>
  );
}
