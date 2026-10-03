'use client';

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, ConfirmDialog, Dialog, EmptyState, PageHeader, Pagination, SelectField, Skeleton, Tabs, TextAreaField, TextField, useToast, type BadgeTone } from '@schovexa/ui';
import { Check, CalendarOff, Paperclip, Plus, X } from 'lucide-react';
import { useAllLeave, useMyLeave, type FileInfo, type LeaveBalance, type LeaveRow } from '../../hooks/useTeaching';
import { useCan } from '../../hooks/useCan';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { api, ApiError } from '../../lib/api-client';
import { formatDay } from '../finance/finance-ui';
import { FilePanel, isoDay, useRefreshTeaching } from './teaching-ui';

const KIND_LABELS: Record<string, string> = { CASUAL: 'Casual leave', SICK: 'Sick leave', EARNED: 'Earned leave', UNPAID: 'Unpaid leave', OTHER: 'Other' };
const STATUS_LABELS: Record<LeaveRow['status'], string> = { PENDING: 'Waiting for approval', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled' };
const STATUS_TONES: Record<LeaveRow['status'], BadgeTone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'neutral' };

const dayLabel = (r: LeaveRow) => (r.startDate === r.endDate ? formatDay(r.startDate) : `${formatDay(r.startDate)} – ${formatDay(r.endDate)}`);

export function BalanceCards({ balances }: { balances: LeaveBalance[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {balances.map((b) => (
        <li key={b.kind} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{KIND_LABELS[b.kind]}</p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums text-navy">
            {b.remaining} <span className="text-sm font-medium text-slate-400">of {b.allowance} days left</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {b.used} taken{b.pending > 0 ? ` · ${b.pending} waiting for approval` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ApplyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const input = useRef<HTMLInputElement>(null);
  const today = isoDay(new Date());
  const [kind, setKind] = useState('CASUAL');
  const [startDate, setStart] = useState(today);
  const [endDate, setEnd] = useState(today);
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (reason.trim().length < 5) return setError('Give a reason (at least 5 characters).');
    if (endDate < startDate) return setError('The last day can’t be before the first.');
    setBusy(true);
    try {
      const created = await api.post<{ id: string }>('/leave', { kind, startDate, endDate: halfDay ? startDate : endDate, halfDay, reason: reason.trim() });
      if (file) {
        const form = new FormData();
        form.append('file', file);
        try {
          await api.postForm(`/leave/mine/${created.id}/files`, form);
        } catch {
          toast.show({ tone: 'info', title: 'Leave requested, but the file didn’t upload', description: 'Open the request to add it again.' });
        }
      }
      await refresh();
      toast.show({ tone: 'success', title: 'Leave requested', description: 'The Principal has been told.' });
      setReason('');
      setFile(null);
      setHalfDay(false);
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
      size="lg"
      eyebrow="Leave"
      title="Apply for leave"
      description="Weekly offs and holidays aren’t counted. Your request goes to the Principal."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy}>Send request</Button>
        </>
      }
    >
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SelectField label="Type" value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </SelectField>
          <TextField label="First day" type="date" value={startDate} onChange={(e) => { setStart(e.target.value); if (endDate < e.target.value) setEnd(e.target.value); }} />
          <TextField label="Last day" type="date" value={halfDay ? startDate : endDate} disabled={halfDay} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-navy">
          <input type="checkbox" checked={halfDay} onChange={(e) => setHalfDay(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          Half day (a single day)
        </label>
        <TextAreaField label="Reason" rows={3} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        <div>
          <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" aria-label="Supporting document" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button variant="secondary" size="sm" onClick={() => input.current?.click()}>
            <Paperclip size={14} /> {file ? file.name : 'Attach a supporting document (optional)'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function MyFilesDialog({ leave, onClose }: { leave: LeaveRow | null; onClose: () => void }) {
  const refresh = useRefreshTeaching();
  const { data } = useQuery({ queryKey: ['teaching', 'leave-files', leave?.id], queryFn: () => api.get<FileInfo[]>(`/leave/mine/${leave!.id}/files`), enabled: !!leave });
  return (
    <Dialog open={!!leave} onClose={onClose} title="Supporting documents" description={leave ? `${KIND_LABELS[leave.kind]} · ${dayLabel(leave)}` : undefined}>
      {leave && <FilePanel basePath={`/leave/mine/${leave.id}/files`} files={data ?? []} canEdit={leave.status === 'PENDING'} canRemove={false} title="Files" hint="No documents attached." onChanged={refresh} />}
    </Dialog>
  );
}

function ReviewFilesDialog({ leave, onClose }: { leave: LeaveRow | null; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ['teaching', 'leave-files', 'review', leave?.id], queryFn: () => api.get<FileInfo[]>(`/leave/${leave!.id}/files`), enabled: !!leave });
  return (
    <Dialog open={!!leave} onClose={onClose} title="Supporting documents" description={leave ? `${leave.applicant ?? 'Staff member'} · ${dayLabel(leave)}` : undefined}>
      {leave && <FilePanel basePath={`/leave/${leave.id}/files`} files={data ?? []} canEdit={false} title="Files" hint="No documents attached." onChanged={() => undefined} />}
    </Dialog>
  );
}

function MyLeave() {
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const { data, isLoading, isError } = useMyLeave();
  const [applying, setApplying] = useState(false);
  const [cancelling, setCancelling] = useState<LeaveRow | null>(null);
  const [filesFor, setFilesFor] = useState<LeaveRow | null>(null);
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    try {
      await api.post(`/leave/mine/${cancelling.id}/cancel`);
      await refresh();
      setCancelling(null);
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not cancel', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {isError && <Alert variant="error">We couldn’t load your leave.</Alert>}
      {isLoading && <Skeleton className="h-32 w-full rounded-xl" />}
      {data && <BalanceCards balances={data.balances} />}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-navy">My requests</h2>
          <Button size="sm" onClick={() => setApplying(true)}><Plus size={14} /> Apply for leave</Button>
        </div>
        {data && data.requests.length === 0 && <div className="mt-4"><EmptyState icon={<CalendarOff size={22} />} title="No leave requests yet" description="When you apply, you can follow its approval here." /></div>}
        <ul className="mt-4 flex flex-col gap-2">
          {data?.requests.map((r) => (
            <li key={r.id} className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-navy">
                    {KIND_LABELS[r.kind] ?? r.kind} · {dayLabel(r)}
                    <span className="text-sm font-normal text-slate-500">({r.days} {r.days === 1 ? 'day' : 'days'}{r.halfDay ? ', half day' : ''})</span>
                    <Badge tone={STATUS_TONES[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{r.reason}</p>
                  {r.decidedBy && <p className="mt-1 text-xs text-slate-400">{r.status === 'REJECTED' ? 'Rejected' : 'Decided'} by {r.decidedBy}{r.decisionNote ? ` — “${r.decisionNote}”` : ''}</p>}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setFilesFor(r)} aria-label="Supporting documents"><Paperclip size={14} /> {r.files > 0 ? r.files : ''}</Button>
                  {r.status === 'PENDING' && <Button size="sm" variant="soft-danger" onClick={() => setCancelling(r)}>Cancel</Button>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <ApplyDialog open={applying} onClose={() => setApplying(false)} />
      <MyFilesDialog leave={filesFor} onClose={() => setFilesFor(null)} />
      <ConfirmDialog open={!!cancelling} title="Cancel this request?" description="It is withdrawn and doesn’t count against your balance." confirmLabel="Cancel request" tone="danger" loading={busy} onConfirm={cancel} onCancel={() => setCancelling(null)} />
    </div>
  );
}

function Requests() {
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const { can } = useCan();
  const { data: me } = useCurrentUser();
  const canDecide = can('leave.approve');
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAllLeave(status, page);
  const [action, setAction] = useState<{ kind: 'approve' | 'reject'; row: LeaveRow } | null>(null);
  const [note, setNote] = useState('');
  const [filesFor, setFilesFor] = useState<LeaveRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!action) return;
    if (action.kind === 'reject' && note.trim().length < 3) return setError('Say why it is being rejected.');
    setBusy(true);
    setError(null);
    try {
      await api.post(`/leave/${action.row.id}/${action.kind}`, { note: note.trim() || undefined });
      await refresh();
      toast.show({ tone: 'success', title: action.kind === 'approve' ? 'Leave approved' : 'Leave rejected', description: `${action.row.applicant ?? 'The applicant'} has been told.` });
      setAction(null);
      setNote('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const counts = data?.counts;
  const tabs = [
    { id: 'PENDING', label: 'To decide', count: counts?.PENDING },
    { id: 'APPROVED', label: 'Approved' },
    { id: 'REJECTED', label: 'Rejected' },
    { id: '', label: 'All' },
  ];

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
      <Tabs className="w-fit max-w-full" value={status} onChange={(v) => { setStatus(v); setPage(1); }} tabs={tabs} />
      {isLoading && <Skeleton className="mt-4 h-32 w-full rounded-xl" />}
      {data && data.data.length === 0 && <div className="mt-4"><EmptyState icon={<CalendarOff size={22} />} title="Nothing here" description="Leave requests from staff appear here." /></div>}
      <ul className="mt-4 flex flex-col gap-2">
        {data?.data.map((r) => (
          <li key={r.id} className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-navy">
                  {r.applicant ?? 'Staff member'}
                  <Badge tone={STATUS_TONES[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                </p>
                <p className="text-sm text-slate-600">{KIND_LABELS[r.kind] ?? r.kind} · {dayLabel(r)} ({r.days} {r.days === 1 ? 'day' : 'days'})</p>
                <p className="mt-1 text-sm text-slate-600">{r.reason}</p>
                {r.decidedBy && <p className="mt-1 text-xs text-slate-400">Decided by {r.decidedBy}{r.decisionNote ? ` — “${r.decisionNote}”` : ''}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {r.files > 0 && <Button size="sm" variant="ghost" onClick={() => setFilesFor(r)}><Paperclip size={14} /> {r.files}</Button>}
                {r.status === 'PENDING' && canDecide && (
                  r.userId === me?.id ? (
                    <span className="text-xs text-slate-400">Someone else has to decide your own leave</span>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => { setAction({ kind: 'approve', row: r }); setNote(''); setError(null); }}><Check size={14} /> Approve</Button>
                      <Button size="sm" variant="soft-danger" onClick={() => { setAction({ kind: 'reject', row: r }); setNote(''); setError(null); }}><X size={14} /> Reject</Button>
                    </>
                  )
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {data && data.pagination.totalPages > 1 && (
        <div className="mt-4">
          <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={data.pagination.pageSize} noun="requests" onPageChange={setPage} />
        </div>
      )}
      <ReviewFilesDialog leave={filesFor} onClose={() => setFilesFor(null)} />
      <Dialog
        open={!!action}
        onClose={() => setAction(null)}
        title={action?.kind === 'reject' ? 'Reject this leave?' : 'Approve this leave?'}
        description={action ? `${action.row.applicant ?? 'Staff member'} · ${dayLabel(action.row)}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAction(null)} disabled={busy}>Cancel</Button>
            <Button variant={action?.kind === 'reject' ? 'danger' : 'primary'} onClick={run} loading={busy}>{action?.kind === 'reject' ? 'Reject leave' : 'Approve leave'}</Button>
          </>
        }
      >
        {error && <Alert variant="error" className="mb-3">{error}</Alert>}
        <TextAreaField label={action?.kind === 'reject' ? 'Why is it rejected? (required)' : 'Note (optional)'} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Dialog>
    </section>
  );
}

export function LeaveView() {
  const { can } = useCan();
  const mine = can('leave.apply');
  const all = can('leave.view');
  const tabs = [...(mine ? [{ id: 'mine', label: 'My leave' }] : []), ...(all ? [{ id: 'requests', label: 'Staff requests' }] : [])];
  const [tab, setTab] = useState(mine ? 'mine' : 'requests');
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Me" title="Leave" description={all ? 'Apply for your own leave and decide on staff requests.' : 'Apply for leave, see your balance and follow each request.'} />
      {tabs.length > 1 && <Tabs className="mt-6 w-fit" value={tab} onChange={setTab} tabs={tabs} />}
      <div className="mt-4">{tab === 'mine' && mine ? <MyLeave /> : all ? <Requests /> : null}</div>
    </div>
  );
}
