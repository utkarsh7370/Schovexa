'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert, Badge, Button, ConfirmDialog, Dialog, EmptyState, PageHeader, Pagination, SearchInput, Skeleton, Tabs, TextAreaField, useToast } from '@schovexa/ui';
import { Check, RotateCcw, SearchX, Undo2, X } from 'lucide-react';
import { useRefunds, type RefundRow } from '../../../../../hooks/useFinance';
import { useCan } from '../../../../../hooks/useCan';
import { useCurrentUser } from '../../../../../hooks/useCurrentUser';
import { useDebouncedValue } from '../../../../../hooks/useDebouncedValue';
import { api, ApiError } from '../../../../../lib/api-client';
import { formatMinor } from '../../../../../lib/currency';
import { useRefreshFinance } from '../../../../../components/finance/finance-dialogs';
import { REFUND_STATUS_LABELS, REFUND_STATUS_TONES, RESULT_PANEL, FILTER_PANEL, formatDay } from '../../../../../components/finance/finance-ui';

type Action = { kind: 'approve' | 'reject' | 'process' | 'withdraw'; refund: RefundRow };

const TABS = [
  { id: '', label: 'All' },
  { id: 'REQUESTED', label: 'To approve' },
  { id: 'APPROVED', label: 'To pay out' },
  { id: 'PROCESSED', label: 'Paid out' },
  { id: 'REJECTED', label: 'Rejected' },
];

function RefundsView() {
  const params = useSearchParams();
  const { can } = useCan();
  const { data: me } = useCurrentUser();
  const toast = useToast();
  const refresh = useRefreshFinance();
  const [status, setStatus] = useState(TABS.some((t) => t.id === params.get('status')) ? (params.get('status') as string) : '');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useRefunds({ status: status || undefined, search: debounced || undefined, page, pageSize: 20 });
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!action) return;
    if (action.kind === 'reject' && note.trim().length < 3) return setError('Say why it is being rejected.');
    setBusy(true);
    setError(null);
    try {
      await api.post(`/refunds/${action.refund.id}/${action.kind}`, action.kind === 'approve' || action.kind === 'reject' ? { note: note.trim() || undefined } : undefined);
      await refresh();
      toast.show({
        tone: 'success',
        title: { approve: 'Refund approved', reject: 'Refund rejected', process: 'Refund paid out', withdraw: 'Request withdrawn' }[action.kind],
        description: action.kind === 'process' ? 'The fee balance has been updated.' : undefined,
      });
      setAction(null);
      setNote('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const counts = data?.counts;
  const countFor = (id: string) => (id === '' ? (counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined) : counts?.[id as keyof typeof counts]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Finance" title="Refunds" description="Requested by the accountant, approved by the Principal or Director, then paid back in cash." />

      <Tabs className="mt-6 w-fit max-w-full" value={status} onChange={(v) => { setStatus(v); setPage(1); }} tabs={TABS.map((t) => ({ ...t, count: countFor(t.id) }))} />

      <div className={`${FILTER_PANEL} mt-4`}>
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by student, admission number, receipt no. or reason…" aria-label="Search refunds" />
      </div>

      <div className={RESULT_PANEL}>
        {isError && <Alert variant="error">We couldn’t load refund requests.</Alert>}
        {isLoading && <Skeleton className="h-32 w-full rounded-xl" />}
        {data && data.data.length === 0 && <EmptyState icon={search || status ? <SearchX size={22} /> : <RotateCcw size={22} />} title="No refund requests" description={search || status ? 'Nothing matches this view.' : 'Refunds are requested from a payment on the Transactions page.'} />}
        <ul className="flex flex-col gap-3">
          {data?.data.map((r) => {
            const mine = r.requestedById === me?.id;
            return (
              <li key={r.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-bold text-navy">
                      <Link href={`/dashboard/finance/students/${r.student.id}`} className="hover:text-brand-blue">{r.student.name}</Link>
                      <span className="font-mono text-xs font-normal text-slate-400">{r.student.admissionNo}</span>
                      <Badge tone={REFUND_STATUS_TONES[r.status]}>{REFUND_STATUS_LABELS[r.status]}</Badge>
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{r.reason}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {r.feeCategory} · payment {formatMinor(r.payment.amountMinor)} on {formatDay(r.payment.paidAt)}
                      {r.payment.receiptId && <> · <Link href={`/dashboard/receipts/${r.payment.receiptId}`} className="font-mono text-brand-blue hover:underline">{r.payment.receiptNo}</Link></>}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Asked by {r.requestedBy ?? 'someone'} on {formatDay(r.createdAt)}
                      {r.decidedBy && <> · {r.status === 'REJECTED' ? 'decided' : 'approved'} by {r.decidedBy}{r.decisionNote ? ` (“${r.decisionNote}”)` : ''}</>}
                      {r.processedBy && <> · paid out by {r.processedBy} on {formatDay(r.processedAt)}</>}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <p className="text-xl font-extrabold text-navy">{formatMinor(r.amountMinor)}</p>
                    <div className="flex flex-wrap justify-end gap-2">
                      {r.status === 'REQUESTED' && can('refund.approve') && !mine && (
                        <>
                          <Button size="sm" onClick={() => { setAction({ kind: 'approve', refund: r }); setNote(''); setError(null); }}><Check size={14} /> Approve</Button>
                          <Button size="sm" variant="soft-danger" onClick={() => { setAction({ kind: 'reject', refund: r }); setNote(''); setError(null); }}><X size={14} /> Reject</Button>
                        </>
                      )}
                      {r.status === 'REQUESTED' && mine && can('refund.request') && (
                        <Button size="sm" variant="secondary" onClick={() => { setAction({ kind: 'withdraw', refund: r }); setError(null); }}><Undo2 size={14} /> Withdraw</Button>
                      )}
                      {r.status === 'REQUESTED' && mine && can('refund.approve') && <span className="self-center text-xs text-slate-400">Someone else has to approve your own request</span>}
                      {r.status === 'APPROVED' && can('refund.process') && (
                        <Button size="sm" onClick={() => { setAction({ kind: 'process', refund: r }); setError(null); }}><RotateCcw size={14} /> Pay out in cash</Button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {data && data.pagination.totalPages > 1 && (
          <div className="mt-4">
            <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={data.pagination.pageSize} noun="requests" onPageChange={setPage} />
          </div>
        )}
      </div>

      <Dialog
        open={!!action && (action.kind === 'approve' || action.kind === 'reject')}
        onClose={() => setAction(null)}
        title={action?.kind === 'reject' ? 'Reject this refund?' : 'Approve this refund?'}
        description={action ? `${action.refund.student.name} · ${formatMinor(action.refund.amountMinor)}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAction(null)} disabled={busy}>Cancel</Button>
            <Button variant={action?.kind === 'reject' ? 'danger' : 'primary'} onClick={run} loading={busy}>{action?.kind === 'reject' ? 'Reject refund' : 'Approve refund'}</Button>
          </>
        }
      >
        {error && <Alert variant="error" className="mb-3">{error}</Alert>}
        <p className="mb-3 text-sm text-slate-600">Reason given: “{action?.refund.reason}”</p>
        <TextAreaField label={action?.kind === 'reject' ? 'Why is it rejected? (required)' : 'Note (optional)'} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Dialog>

      <ConfirmDialog
        open={!!action && (action.kind === 'process' || action.kind === 'withdraw')}
        title={action?.kind === 'process' ? 'Pay out this refund?' : 'Withdraw this request?'}
        description={action?.kind === 'process' ? `Hand ${formatMinor(action.refund.amountMinor)} back in cash to the family of ${action.refund.student.name}. The fee balance goes back up by that amount. This can’t be undone.` : 'The request is closed and nothing is refunded.'}
        confirmLabel={action?.kind === 'process' ? 'Yes, I have paid it out' : 'Withdraw'}
        tone={action?.kind === 'process' ? 'default' : 'danger'}
        loading={busy}
        onConfirm={run}
        onCancel={() => setAction(null)}
      />
    </div>
  );
}

export default function RefundsPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-64 max-w-6xl" />}>
      <RefundsView />
    </Suspense>
  );
}
