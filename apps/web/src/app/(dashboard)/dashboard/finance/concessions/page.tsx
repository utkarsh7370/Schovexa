'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Badge, Button, Dialog, EmptyState, PageHeader, Pagination, SearchInput, SelectField, Skeleton, Tabs, TextAreaField, useToast } from '@schovexa/ui';
import { Check, Gift, SearchX, X } from 'lucide-react';
import { useConcessions, type ConcessionRow } from '../../../../../hooks/useFinance';
import { useCan } from '../../../../../hooks/useCan';
import { useCurrentUser } from '../../../../../hooks/useCurrentUser';
import { useDebouncedValue } from '../../../../../hooks/useDebouncedValue';
import { api, ApiError } from '../../../../../lib/api-client';
import { formatMinor } from '../../../../../lib/currency';
import { useRefreshFinance } from '../../../../../components/finance/finance-dialogs';
import { CONCESSION_KIND_LABELS, CONCESSION_STATUS_LABELS, CONCESSION_STATUS_TONES, FILTER_PANEL, RESULT_PANEL, formatDay } from '../../../../../components/finance/finance-ui';

type Action = { kind: 'approve' | 'reject' | 'apply'; row: ConcessionRow };

const TABS = [
  { id: '', label: 'All' },
  { id: 'REQUESTED', label: 'To approve' },
  { id: 'APPROVED', label: 'To apply' },
  { id: 'APPLIED', label: 'Applied' },
  { id: 'REJECTED', label: 'Rejected' },
];

export default function ConcessionsPage() {
  const { can } = useCan();
  const { data: me } = useCurrentUser();
  const toast = useToast();
  const refresh = useRefreshFinance();
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useConcessions({ status: status || undefined, kind: kind || undefined, search: debounced || undefined, page, pageSize: 20 });
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
      await api.post(`/concessions/${action.row.id}/${action.kind}`, action.kind === 'apply' ? undefined : { note: note.trim() || undefined });
      await refresh();
      toast.show({ tone: 'success', title: { approve: 'Approved', reject: 'Rejected', apply: 'Applied to the fee' }[action.kind] });
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
  const open = (kindOfAction: Action['kind'], row: ConcessionRow) => {
    setAction({ kind: kindOfAction, row });
    setNote('');
    setError(null);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Finance"
        title="Discounts & scholarships"
        description={`Small discounts (up to ${data?.maxDiscountPercent ?? 5}% of a fee) are applied by the accountant. Scholarships, concessions and bigger discounts need the Principal or Director to approve first.`}
      />

      <Tabs className="mt-6 w-fit max-w-full" value={status} onChange={(v) => { setStatus(v); setPage(1); }} tabs={TABS.map((t) => ({ ...t, count: countFor(t.id) }))} />

      <div className={`${FILTER_PANEL} mt-4`}>
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by student, admission number, name or reason…" aria-label="Search discounts" />
        <div className="mt-3 max-w-xs">
          <SelectField fieldSize="sm" aria-label="Type" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}>
            <option value="">All types</option>
            {Object.entries(CONCESSION_KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </SelectField>
        </div>
      </div>

      <div className={RESULT_PANEL}>
        {isError && <Alert variant="error">We couldn’t load the list.</Alert>}
        {isLoading && <Skeleton className="h-32 w-full rounded-xl" />}
        {data && data.data.length === 0 && <EmptyState icon={search || status || kind ? <SearchX size={22} /> : <Gift size={22} />} title="Nothing here yet" description={search || status || kind ? 'Nothing matches this view.' : 'Request a discount from a student’s Fees tab.'} />}
        <ul className="flex flex-col gap-3">
          {data?.data.map((c) => {
            const mine = c.requestedById === me?.id;
            return (
              <li key={c.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-bold text-navy">
                      {c.name}
                      <Badge tone="brand">{CONCESSION_KIND_LABELS[c.kind]}</Badge>
                      <Badge tone={CONCESSION_STATUS_TONES[c.status]}>{CONCESSION_STATUS_LABELS[c.status]}</Badge>
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      <Link href={`/dashboard/finance/students/${c.student.id}`} className="font-semibold hover:text-brand-blue">{c.student.name}</Link>{' '}
                      <span className="font-mono text-xs text-slate-400">{c.student.admissionNo}</span> · {c.feeCategory} (fee {formatMinor(c.feeAmountMinor)})
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{c.reason}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Asked by {c.requestedBy ?? 'someone'} on {formatDay(c.createdAt)}
                      {c.decidedBy && <> · decided by {c.decidedBy}{c.decisionNote ? ` (“${c.decisionNote}”)` : ''}</>}
                      {c.appliedBy && <> · applied by {c.appliedBy} on {formatDay(c.appliedAt)}</>}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <p className="text-xl font-extrabold text-navy">{formatMinor(c.amountMinor)}</p>
                    <div className="flex flex-wrap justify-end gap-2">
                      {c.status === 'REQUESTED' && can('discount.approve') && !mine && (
                        <>
                          <Button size="sm" onClick={() => open('approve', c)}><Check size={14} /> Approve</Button>
                          <Button size="sm" variant="soft-danger" onClick={() => open('reject', c)}><X size={14} /> Reject</Button>
                        </>
                      )}
                      {c.status === 'REQUESTED' && mine && <span className="self-center text-xs text-slate-400">Waiting for someone else to approve</span>}
                      {c.status === 'APPROVED' && can('discount.apply') && <Button size="sm" onClick={() => open('apply', c)}><Gift size={14} /> Apply to fee</Button>}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {data && data.pagination.totalPages > 1 && (
          <div className="mt-4">
            <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={data.pagination.pageSize} noun="entries" onPageChange={setPage} />
          </div>
        )}
      </div>

      <Dialog
        open={!!action}
        onClose={() => setAction(null)}
        title={action?.kind === 'reject' ? 'Reject this request?' : action?.kind === 'approve' ? 'Approve this request?' : 'Apply to the fee?'}
        description={action ? `${action.row.name} · ${action.row.student.name} · ${formatMinor(action.row.amountMinor)}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAction(null)} disabled={busy}>Cancel</Button>
            <Button variant={action?.kind === 'reject' ? 'danger' : 'primary'} onClick={run} loading={busy}>
              {action?.kind === 'reject' ? 'Reject' : action?.kind === 'approve' ? 'Approve' : 'Apply now'}
            </Button>
          </>
        }
      >
        {error && <Alert variant="error" className="mb-3">{error}</Alert>}
        {action?.kind === 'apply' ? (
          <p className="text-sm text-slate-600">The family will owe {formatMinor(action.row.amountMinor)} less on {action.row.feeCategory}. This is recorded and can’t be undone from here.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-600">Reason given: “{action?.row.reason}”</p>
            <TextAreaField label={action?.kind === 'reject' ? 'Why is it rejected? (required)' : 'Note (optional)'} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </>
        )}
      </Dialog>
    </div>
  );
}
